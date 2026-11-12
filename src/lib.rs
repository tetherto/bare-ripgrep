mod glob;
mod request;
mod scope;
mod search;
mod walk;

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::slice;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use request::{Op, Request};
use scope::Scope;
use serde::Serialize;

pub struct Job {
    request: Vec<u8>,
    cancel: Arc<AtomicBool>,
    result: Mutex<Vec<u8>>,
}

#[derive(Serialize)]
struct Failure {
    error: String,
}

fn execute(job: &Job) -> Result<Vec<u8>, String> {
    let request: Request =
        serde_json::from_slice(&job.request).map_err(|err| format!("invalid request: {err}"))?;
    let scope = Arc::new(Scope::new(&request, Arc::clone(&job.cancel))?);
    let max_matches = usize::try_from(request.max_matches).unwrap_or(usize::MAX - 1);

    let json = match request.op {
        Op::Search => {
            let matcher = search::matcher(&request)?;
            serde_json::to_vec(&search::search(scope, matcher, max_matches))
        }
        Op::Walk => serde_json::to_vec(&walk::walk(scope)),
    };
    json.map_err(|err| err.to_string())
}

fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    let detail = payload
        .downcast_ref::<&str>()
        .map(|text| text.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_default();
    format!("internal error: {detail}")
}

/// # Safety
/// `json` must point to `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn rg_job_new(json: *const u8, len: usize) -> *mut Job {
    let request = slice::from_raw_parts(json, len).to_vec();
    Box::into_raw(Box::new(Job {
        request,
        cancel: Arc::new(AtomicBool::new(false)),
        result: Mutex::new(Vec::new()),
    }))
}

/// Blocks until the job is done; call it off the JS thread. Never unwinds.
///
/// # Safety
/// `job` must come from `rg_job_new` and not be freed while this runs.
#[no_mangle]
pub unsafe extern "C" fn rg_job_run(job: *const Job) {
    let job = &*job;
    let outcome = catch_unwind(AssertUnwindSafe(|| execute(job)));
    let bytes = match outcome {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(error)) => serde_json::to_vec(&Failure { error }).unwrap_or_default(),
        Err(payload) => serde_json::to_vec(&Failure {
            error: panic_message(payload.as_ref()),
        })
        .unwrap_or_default(),
    };
    *job.result
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = bytes;
}

/// # Safety
/// `job` must come from `rg_job_new` and not be freed.
#[no_mangle]
pub unsafe extern "C" fn rg_job_cancel(job: *const Job) {
    (*job).cancel.store(true, Ordering::Relaxed);
}

/// The JSON result, valid until `rg_job_free`. Call after `rg_job_run` returned.
///
/// # Safety
/// `job` must come from `rg_job_new`; `len` must be writable.
#[no_mangle]
pub unsafe extern "C" fn rg_job_result(job: *const Job, len: *mut usize) -> *const u8 {
    let result = (*job)
        .result
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *len = result.len();
    result.as_ptr()
}

/// # Safety
/// `job` must come from `rg_job_new` and not be used after.
#[no_mangle]
pub unsafe extern "C" fn rg_job_free(job: *mut Job) {
    drop(Box::from_raw(job));
}
