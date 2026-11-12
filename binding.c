#include <assert.h>
#include <bare.h>
#include <js.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <uv.h>

#include "src/bare_ripgrep.h"

typedef struct {
  uv_work_t handle;
  js_env_t *env;
  js_ref_t *cb;
  js_deferred_teardown_t *teardown;
  rg_job_t *job;
  bool exiting;
} bare_ripgrep_job_t;

static void
bare_ripgrep__on_work (uv_work_t *handle) {
  bare_ripgrep_job_t *job = handle->data;

  rg_job_run(job->job);
}

static void
bare_ripgrep__on_after_work (uv_work_t *handle, int status) {
  int err;

  bare_ripgrep_job_t *job = handle->data;
  js_env_t *env = job->env;
  js_deferred_teardown_t *teardown = job->teardown;

  if (!job->exiting) {
    js_handle_scope_t *scope;
    err = js_open_handle_scope(env, &scope);
    assert(err == 0);

    js_value_t *cb;
    err = js_get_reference_value(env, job->cb, &cb);
    assert(err == 0);

    size_t len;
    const char *json = rg_job_result(job->job, &len);

    js_value_t *argv[1];
    err = js_create_string_utf8(env, (const utf8_t *) json, len, &argv[0]);
    assert(err == 0);

    js_value_t *global;
    err = js_get_global(env, &global);
    assert(err == 0);

    js_call_function_with_checkpoint(env, global, cb, 1, argv, NULL);

    err = js_close_handle_scope(env, scope);
    assert(err == 0);
  }

  err = js_delete_reference(env, job->cb);
  assert(err == 0);

  rg_job_free(job->job);
  free(job);

  err = js_finish_deferred_teardown_callback(teardown);
  assert(err == 0);
}

static void
bare_ripgrep__on_teardown (js_deferred_teardown_t *handle, void *data) {
  bare_ripgrep_job_t *job = data;

  job->exiting = true;

  rg_job_cancel(job->job);
}

static js_value_t *
bare_ripgrep_start (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  size_t len;
  err = js_get_value_string_utf8(env, argv[0], NULL, 0, &len);
  assert(err == 0);

  utf8_t *json = malloc(len + 1);
  err = js_get_value_string_utf8(env, argv[0], json, len + 1, &len);
  assert(err == 0);

  bare_ripgrep_job_t *job = malloc(sizeof(bare_ripgrep_job_t));
  job->env = env;
  job->exiting = false;
  job->handle.data = job;
  job->job = rg_job_new((const char *) json, len);

  free(json);

  err = js_create_reference(env, argv[1], 1, &job->cb);
  assert(err == 0);

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  err = js_add_deferred_teardown_callback(env, bare_ripgrep__on_teardown, job, &job->teardown);
  assert(err == 0);

  err = uv_queue_work(loop, &job->handle, bare_ripgrep__on_work, bare_ripgrep__on_after_work);
  assert(err == 0);

  js_value_t *handle;
  err = js_create_external(env, job, NULL, NULL, &handle);
  assert(err == 0);

  return handle;
}

static js_value_t *
bare_ripgrep_cancel (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_ripgrep_job_t *job;
  err = js_get_value_external(env, argv[0], (void **) &job);
  assert(err == 0);

  rg_job_cancel(job->job);

  return NULL;
}

static js_value_t *
bare_ripgrep_exports (js_env_t *env, js_value_t *exports) {
  int err;

#define V(name, fn) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, NULL, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("start", bare_ripgrep_start)
  V("cancel", bare_ripgrep_cancel)
#undef V

  return exports;
}

BARE_MODULE(bare_ripgrep, bare_ripgrep_exports)
