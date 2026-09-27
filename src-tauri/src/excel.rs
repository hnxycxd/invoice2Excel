use crate::DetailRow;
use rust_xlsxwriter::{ExcelDateTime, Format, FormatAlign, FormatBorder, Workbook};

/// "2026-07-27" -> (2026, 7, 27)，无法解析时返回 None
pub fn parse_ymd(s: &str) -> Option<(u16, u8, u8)> {
    let parts: Vec<&str> = s.trim().split(['-', '/']).collect();
    if let [y, m, d] = parts[..] {
        if let (Ok(y), Ok(m), Ok(d)) = (y.parse::<u16>(), m.parse::<u8>(), d.parse::<u8>()) {
            if (1..=12).contains(&m) && (1..=31).contains(&d) {
                return Some((y, m, d));
            }
        }
    }
    None
}

/// 严格按模板复刻版式：
/// 横版 A4，B2:O2 标题（宋体 21 加粗，行高 30），其余行高 33；
/// 摘要=B:F，金额=G:K，附单据数=L:O；金额 Arial 12、中文 宋体 12、签字行 黑体 11。
pub fn build_workbook(date_str: &str, department: &str, project: &str, details: &[DetailRow]) -> Workbook {
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("费用报销单").unwrap();

    // 列宽：数值取自模板 XML 存储宽度；rust_xlsxwriter 落盘时会加 5/7 字符的
    // 像素换算差，因此这里预减 5/7，使最终文件与模板逐列一致（I/J/K 默认宽 9.0）。
    // F 列在模板宽度 10.125 基础上加宽到 12.0。
    const PAD: f64 = 5.0 / 7.0;
    for (col, width) in [
        (0u16, 11.375), (1, 10.625), (2, 6.5), (3, 7.125), (4, 4.25), (5, 12.0),
        (6, 2.25), (7, 8.25), (8, 9.0), (9, 9.0), (10, 9.0), (11, 2.5),
        (12, 4.75), (13, 6.125), (14, 5.0),
    ] {
        ws.set_column_width(col, width - PAD).unwrap();
    }

    let f_title = Format::new()
        .set_font_name("宋体")
        .set_font_size(21)
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::Top)
        .set_text_wrap();
    let f_date = Format::new()
        .set_font_name("黑体")
        .set_font_size(12)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_num_format("yyyy\"年\"m\"月\"d\"日\"");
    let f_label = Format::new()
        .set_font_name("宋体")
        .set_font_size(12)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let f_value = f_label.clone();
    let f_summary = f_label.clone();
    let f_amount = Format::new()
        .set_font_name("Arial")
        .set_font_size(12)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let f_total_label = Format::new()
        .set_font_name("宋体")
        .set_font_size(12)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::Top)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let f_approval = Format::new()
        .set_font_name("宋体")
        .set_font_size(12)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let f_sign = Format::new()
        .set_font_name("黑体")
        .set_font_size(11)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap();

    // 行高：标题行 30，其余全部 33
    ws.set_row_height(1, 30.0).unwrap();
    for r in 2..=(5 + details.len() as u32 + 3) {
        ws.set_row_height(r, 33.0).unwrap();
    }

    // 标题、日期（B:O 合并，列索引 1..14）
    ws.merge_range(1, 1, 1, 14, "费 用 报 销 单", &f_title).unwrap();
    let (y, m, d) = parse_ymd(date_str).unwrap_or((2026, 1, 1));
    let date = ExcelDateTime::from_ymd(y, m, d).unwrap();
    ws.merge_range(2, 1, 2, 14, "", &f_date).unwrap();
    ws.write_date_with_format(2, 1, &date, &f_date).unwrap();

    // 部门 / 项目名称（B4 标签，C4:F4 值，G4:K4 标签，L4:O4 值）
    ws.write_string_with_format(3, 1, "部 门", &f_label).unwrap();
    ws.merge_range(3, 2, 3, 5, department, &f_value).unwrap();
    ws.merge_range(3, 6, 3, 10, "项 目 名 称", &f_label).unwrap();
    ws.merge_range(3, 11, 3, 14, project, &f_amount).unwrap();

    // 表头
    ws.merge_range(4, 1, 4, 5, "摘                要", &f_label).unwrap();
    ws.merge_range(4, 6, 4, 10, "金额", &f_label).unwrap();
    ws.merge_range(4, 11, 4, 14, "附单据数", &f_label).unwrap();

    // 明细行（金额/附单据数为 0 时不写数字，保持空白便于手工补填）
    let mut r: u32 = 5;
    for d in details {
        ws.merge_range(r, 1, r, 5, &d.summary, &f_summary).unwrap();
        ws.merge_range(r, 6, r, 10, "", &f_amount).unwrap();
        if d.cents != 0 {
            ws.write_number_with_format(r, 6, d.cents as f64 / 100.0, &f_amount).unwrap();
        }
        ws.merge_range(r, 11, r, 14, "", &f_amount).unwrap();
        if d.docs != 0 {
            ws.write_number_with_format(r, 11, f64::from(d.docs), &f_amount).unwrap();
        }
        r += 1;
    }

    // 合计行（大写 + 小写）
    let total: i64 = details.iter().map(|d| d.cents).sum();
    ws.merge_range(r, 1, r, 5, "", &f_total_label).unwrap();
    ws.merge_range(r, 6, r, 10, "", &f_amount).unwrap();
    if total > 0 {
        ws.write_string_with_format(r, 1, format!("人民币\n(大写) {}", crate::rmb::cents_to_upper(total)), &f_total_label)
            .unwrap();
        ws.write_number_with_format(r, 6, total as f64 / 100.0, &f_amount).unwrap();
    } else {
        ws.write_string_with_format(r, 1, "人民币\n(大写)", &f_total_label).unwrap();
    }
    ws.merge_range(r, 11, r, 14, "", &f_amount).unwrap();
    r += 1;

    // 审批行：领导批示(B:D) 财务经理(E:F) 分管领导(G:K) 部门经理(L:O)
    ws.merge_range(r, 1, r, 3, "领导\n批示", &f_approval).unwrap();
    ws.merge_range(r, 4, r, 5, "财务\n经理", &f_approval).unwrap();
    ws.merge_range(r, 6, r, 10, "分管\n领导 ", &f_approval).unwrap();
    ws.merge_range(r, 11, r, 14, "部门\n经理", &f_approval).unwrap();
    r += 1;

    // 签字行：整行合并、无边框
    ws.merge_range(r, 1, r, 14, "财务审核                出纳                 报销人                领款人 ", &f_sign).unwrap();

    // 页面设置：A4 横向，页边距与模板一致
    ws.set_paper_size(9); // 9 = A4
    ws.set_landscape();
    ws.set_margins(0.7, 0.7, 0.75, 0.75, 0.3, 0.3);

    wb
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cn_date() {
        assert_eq!(parse_ymd("2026-07-27"), Some((2026, 7, 27)));
        assert_eq!(parse_ymd("2026/12/05"), Some((2026, 12, 5)));
        assert_eq!(parse_ymd("abc"), None);
        assert_eq!(parse_ymd("2026-13-01"), None);
    }

    #[test]
    fn writes_sample_workbook() {
        let details = vec![
            DetailRow { summary: "市内交通费".into(), cents: 68174, docs: 4 },
            DetailRow { summary: "餐费".into(), cents: 12500, docs: 2 },
            DetailRow { summary: "软件费".into(), cents: 320000, docs: 1 },
        ];
        let mut wb = build_workbook("2026-07-27", "技术部", "OA 系统二期", &details);
        let path = std::env::temp_dir().join("invoice2excel_sample.xlsx");
        wb.save(&path).unwrap();
        println!("sample written to {}", path.display());
    }
}
