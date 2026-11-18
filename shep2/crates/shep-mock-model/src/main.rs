//! `shep-mock-model [ADDRESS]`: serves the mock model (default `127.0.0.1:8765`) until stopped.
//! Then run Shep with `ANTHROPIC_BASE_URL=http://127.0.0.1:8765 ANTHROPIC_API_KEY=mock`.

use std::process::ExitCode;

const DEFAULT_ADDRESS: &str = "127.0.0.1:8765";

fn main() -> ExitCode {
    let address = std::env::args()
        .nth(1)
        .unwrap_or_else(|| DEFAULT_ADDRESS.into());
    match shep_mock_model::MockModel::start_on(&address) {
        Ok(model) => {
            println!("mock model at {}", model.url());
            loop {
                std::thread::park();
            }
        }
        Err(e) => {
            eprintln!("shep-mock-model: {e}");
            ExitCode::FAILURE
        }
    }
}
