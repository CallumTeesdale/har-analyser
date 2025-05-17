#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
struct HarFile {
    log: HarLog,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarLog {
    version: String,
    creator: HarCreator,
    #[serde(default)]
    browser: Option<HarBrowser>,
    pages: Option<Vec<HarPage>>,
    entries: Vec<HarEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarCreator {
    name: String,
    version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarBrowser {
    name: String,
    version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarPage {
    id: String,
    title: String,
    started_date_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarEntry {
    #[serde(rename = "startedDateTime")]
    started_date_time: String,
    time: f64,
    request: HarRequest,
    response: HarResponse,
    cache: HarCache,
    timings: HarTimings,
    #[serde(default)]
    server_ip_address: Option<String>,
    #[serde(default)]
    connection: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarRequest {
    method: String,
    url: String,
    http_version: String,
    cookies: Vec<HarCookie>,
    headers: Vec<HarHeader>,
    query_string: Vec<HarQueryString>,
    post_data: Option<HarPostData>,
    headers_size: i64,
    body_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarResponse {
    status: i64,
    status_text: String,
    http_version: String,
    cookies: Vec<HarCookie>,
    headers: Vec<HarHeader>,
    content: HarContent,
    redirect_url: String,
    headers_size: i64,
    body_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarCookie {
    name: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarHeader {
    name: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarQueryString {
    name: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarPostData {
    mime_type: String,
    text: Option<String>,
    params: Option<Vec<HarParam>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarParam {
    name: String,
    value: Option<String>,
    file_name: Option<String>,
    content_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarContent {
    size: i64,
    mime_type: String,
    text: Option<String>,
    encoding: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarCache {
    #[serde(default)]
    before_request: Option<HarCacheState>,
    #[serde(default)]
    after_request: Option<HarCacheState>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarCacheState {
    expires: Option<String>,
    last_access: String,
    etag: String,
    hit_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct HarTimings {
    blocked: f64,
    dns: f64,
    connect: f64,
    send: f64,
    wait: f64,
    receive: f64,
    ssl: f64,
}

#[tauri::command]
async fn load_har_file(path: String) -> Result<HarFile, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let har_file: HarFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(har_file)
}

#[tauri::command]
async fn replay_request(request: HarRequest) -> Result<String, String> {
    let client = reqwest::Client::new();

    let method = match request.method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        "PATCH" => reqwest::Method::PATCH,
        _ => return Err(format!("Unsupported method: {}", request.method)),
    };

    let mut req_builder = client.request(method, &request.url);

    // Add headers
    for header in request.headers {
        req_builder = req_builder.header(header.name, header.value);
    }

    // Add body if it's a POST request
    if let Some(post_data) = request.post_data {
        if let Some(text) = post_data.text {
            req_builder = req_builder.body(text);
        }
    }

    let response = req_builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let body = response.text().await.map_err(|e| e.to_string())?;

    // Convert HeaderMap to Vec<HarHeader> for serialization
    let header_vec: Vec<HarHeader> = headers
        .iter()
        .map(|(name, value)| {
            HarHeader {
                name: name.to_string(),
                value: value.to_str().unwrap_or("").to_string(),
            }
        })
        .collect();

    let response_data = serde_json::json!({
        "status": status,
        "headers": header_vec,
        "body": body,
    });

    Ok(response_data.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_har_file, replay_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
