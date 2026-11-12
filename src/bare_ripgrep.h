#ifndef BARE_RIPGREP_H
#define BARE_RIPGREP_H

#include <stddef.h>

typedef struct rg_job_s rg_job_t;

rg_job_t *
rg_job_new (const char *json, size_t len);

void
rg_job_run (const rg_job_t *job);

void
rg_job_cancel (const rg_job_t *job);

const char *
rg_job_result (const rg_job_t *job, size_t *len);

void
rg_job_free (rg_job_t *job);

#endif
