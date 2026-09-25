pub fn ping() -> &'static str {
    "pong"
}

#[tauri::command(rename = "ping")]
fn ping_command() -> &'static str {
    ping()
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping_command])
        .run(tauri::generate_context!())
        .expect("error while running Sequelei");
}
