#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod excel;
mod rmb;

use serde::Deserialize;
use tauri_plugin_dialog::DialogExt;

/// 明细表中的一行
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseRow {
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub docs: u32,
}

/// 前端提交的整张表单
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseForm {
    pub name: String,
    pub date: String,
    pub department: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub rows: Vec<ExpenseRow>,
    #[serde(default)]
    pub delete_empty: bool,
    /// 上次保存目录，用于定位另存对话框
    #[serde(default)]
    pub last_dir: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DetailRow {
    pub summary: String,
    pub cents: i64,
    pub docs: u32,
}

/// "681.74" -> 68174（分）；空白或含非法字符返回 None
fn parse_cents(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() || !s.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return None;
    }
    let mut it = s.split('.');
    let int_part = it.next().unwrap_or("");
    let frac = it.next().unwrap_or("");
    if it.next().is_some() || (int_part.is_empty() && frac.is_empty()) {
        return None;
    }
    let yuan: i64 = if int_part.is_empty() { 0 } else { int_part.parse().ok()? };
    let f0 = frac.as_bytes().first().map_or(0, |b| i64::from(b - b'0'));
    let f1 = frac.as_bytes().get(1).map_or(0, |b| i64::from(b - b'0'));
    Some(yuan * 100 + f0 * 10 + f1)
}

/// 按勾选状态过滤明细：空行 = 摘要、金额、附单据数均为空
fn collect_details(form: &ExpenseForm) -> Result<Vec<DetailRow>, String> {
    let mut out = Vec::new();
    for row in &form.rows {
        let cents = parse_cents(&row.amount).unwrap_or(0).min(999_999_999);
        let summary = row.summary.trim();
        let is_empty = summary.is_empty() && cents == 0 && row.docs == 0;
        if form.delete_empty && is_empty {
            continue;
        }
        out.push(DetailRow {
            summary: summary.to_string(),
            cents,
            docs: row.docs,
        });
    }
    if out.is_empty() {
        return Err("报销明细为空：请先填写报销信息，或取消勾选“自动删除空行”。".to_string());
    }
    Ok(out)
}

/// 部门名里的 Windows 非法文件名字符替换为下划线
fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

fn save_dialog(
    app: &tauri::AppHandle,
    default_name: &str,
    last_dir: Option<&str>,
) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let title = "选择 Excel 保存位置";
    match last_dir.map(str::trim).filter(|d| !d.is_empty()) {
        Some(dir) => app
            .dialog()
            .file()
            .set_title(title)
            .add_filter("Excel 工作簿", &["xlsx"])
            .set_directory(std::path::Path::new(dir))
            .set_file_name(default_name),
        None => app
            .dialog()
            .file()
            .set_title(title)
            .add_filter("Excel 工作簿", &["xlsx"])
            .set_file_name(default_name),
    }
}

/// 生成报销单 Excel：弹出另存对话框（默认文件名 姓名_部门_日期.xlsx），
/// 用户确定后写盘；返回 Ok(None) 表示用户取消了对话框。
#[tauri::command]
async fn generate_excel(app: tauri::AppHandle, form: ExpenseForm) -> Result<Option<String>, String> {
    let date = form.date.trim().to_string();
    if date.is_empty() {
        return Err("请选择日期".to_string());
    }
    let name = form.name.trim().to_string();
    if name.is_empty() {
        return Err("请填写姓名".to_string());
    }
    let department = form.department.trim().to_string();
    if department.is_empty() {
        return Err("请填写部门".to_string());
    }
    let details = collect_details(&form)?;

    let default_name = format!(
        "{}_{}_{}.xlsx",
        sanitize_filename(&name),
        sanitize_filename(&department),
        date.replace('/', "-")
    );
    let picked = save_dialog(&app, &default_name, form.last_dir.as_deref()).blocking_save_file();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let mut path = picked.into_path().map_err(|e| e.to_string())?;
    if !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("xlsx")) {
        path.set_extension("xlsx");
    }

    let mut workbook = excel::build_workbook(&date, &department, form.project.trim(), &details);
    workbook.save(&path).map_err(|e| format!("保存 Excel 失败：{e}"))?;

    Ok(Some(path.to_string_lossy().into_owned()))
}

/// 在资源管理器中打开文件所在文件夹并选中该文件
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("文件路径为空".to_string());
    }
    std::process::Command::new("explorer")
        .arg("/select,")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开文件夹失败：{e}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![generate_excel, reveal_in_explorer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cents_parsing() {
        assert_eq!(parse_cents("681.74"), Some(68174));
        assert_eq!(parse_cents("0.5"), Some(50));
        assert_eq!(parse_cents("12"), Some(1200));
        assert_eq!(parse_cents(""), None);
        assert_eq!(parse_cents("abc"), None);
        assert_eq!(parse_cents("1.2.3"), None);
    }

    #[test]
    fn detail_filtering() {
        let form = ExpenseForm {
            name: "张三".into(),
            date: "2026-07-27".into(),
            department: "技术部".into(),
            project: String::new(),
            rows: vec![
                ExpenseRow { summary: "餐费".into(), amount: "100".into(), docs: 1 },
                ExpenseRow { summary: String::new(), amount: String::new(), docs: 0 },
            ],
            delete_empty: true,
            last_dir: None,
        };
        let details = collect_details(&form).unwrap();
        assert_eq!(details.len(), 1);
        assert_eq!(details[0].cents, 10000);

        // 取消勾选时保留空行
        let form_keep = ExpenseForm { delete_empty: false, ..form };
        assert_eq!(collect_details(&form_keep).unwrap().len(), 2);

        // 全空且勾选时报错
        let form_all_empty = ExpenseForm {
            name: "张三".into(),
            date: "2026-07-27".into(),
            department: "技术部".into(),
            project: String::new(),
            rows: vec![ExpenseRow { summary: String::new(), amount: String::new(), docs: 0 }],
            delete_empty: true,
            last_dir: None,
        };
        assert!(collect_details(&form_all_empty).is_err());
    }

    #[test]
    fn filename_sanitizing() {
        assert_eq!(sanitize_filename("技术部/一"), "技术部_一");
        assert_eq!(sanitize_filename("财务部"), "财务部");
    }
}
