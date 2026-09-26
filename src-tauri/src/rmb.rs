/// 人民币金额大写转换（单位：分）。
/// 规则参照银行票据填写规范：681.74 -> 陆佰捌拾壹元柒角肆分。

const CN_DIGITS: [&str; 10] = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const CN_UNITS: [&str; 4] = ["", "拾", "佰", "仟"];
const CN_BIGS: [&str; 3] = ["", "万", "亿"];

/// 0 < s < 10000 的四位段转中文
fn section_to_cn(s: u64) -> String {
    let mut out = String::new();
    let mut pending_zero = false;
    for idx in (0..4).rev() {
        let digit = (s / 10u64.pow(idx)) % 10;
        if digit > 0 {
            if pending_zero {
                out.push('零');
                pending_zero = false;
            }
            out.push_str(CN_DIGITS[digit as usize]);
            out.push_str(CN_UNITS[idx as usize]);
        } else if !out.is_empty() {
            pending_zero = true;
        }
    }
    out
}

fn yuan_to_cn(mut n: u64) -> String {
    if n == 0 {
        return "零".to_string();
    }
    let mut sections = Vec::new();
    while n > 0 {
        sections.push(n % 10000);
        n /= 10000;
    }
    let mut out = String::new();
    for idx in (0..sections.len()).rev() {
        let s = sections[idx];
        if s == 0 {
            continue;
        }
        // 低位段不足千位时补“零”，如 1000005 -> 壹佰万零伍
        if !out.is_empty() && s < 1000 {
            out.push('零');
        }
        out.push_str(&section_to_cn(s));
        out.push_str(CN_BIGS.get(idx).copied().unwrap_or(""));
    }
    out
}

/// cents -> 大写，如 68174 -> “陆佰捌拾壹元柒角肆分”，0 -> “零元整”
pub fn cents_to_upper(cents: i64) -> String {
    if cents <= 0 {
        return "零元整".to_string();
    }
    let yuan = (cents / 100) as u64;
    let jiao = ((cents % 100) / 10) as usize;
    let fen = (cents % 10) as usize;
    if yuan == 0 {
        return match (jiao, fen) {
            (0, f) => format!("{}分", CN_DIGITS[f]),
            (j, 0) => format!("{}角整", CN_DIGITS[j]),
            (j, f) => format!("{}角{}分", CN_DIGITS[j], CN_DIGITS[f]),
        };
    }
    let mut out = format!("{}元", yuan_to_cn(yuan));
    match (jiao, fen) {
        (0, 0) => out.push('整'),
        (0, _) => out.push_str(&format!("零{}分", CN_DIGITS[fen])),
        (_, 0) => out.push_str(&format!("{}角整", CN_DIGITS[jiao])),
        (_, _) => out.push_str(&format!("{}角{}分", CN_DIGITS[jiao], CN_DIGITS[fen])),
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rmb_upper() {
        assert_eq!(cents_to_upper(0), "零元整");
        assert_eq!(cents_to_upper(68174), "陆佰捌拾壹元柒角肆分");
        assert_eq!(cents_to_upper(1200), "壹拾贰元整");
        assert_eq!(cents_to_upper(10500), "壹佰零伍元整");
        assert_eq!(cents_to_upper(10503), "壹佰零伍元零叁分");
        assert_eq!(cents_to_upper(100500), "壹仟零伍元整");
        assert_eq!(cents_to_upper(105506), "壹仟零伍拾伍元零陆分");
        assert_eq!(cents_to_upper(10050), "壹佰元伍角整");
        assert_eq!(cents_to_upper(50), "伍角整");
        assert_eq!(cents_to_upper(5), "伍分");
        assert_eq!(cents_to_upper(1000000), "壹万元整");
        assert_eq!(cents_to_upper(100000000), "壹佰万元整");
        assert_eq!(cents_to_upper(100000050), "壹佰万元伍角整");
        assert_eq!(cents_to_upper(10000005), "壹拾万元零伍分");
        assert_eq!(cents_to_upper(999999999), "玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分");
    }

    #[test]
    fn yuan_sections() {
        assert_eq!(yuan_to_cn(0), "零");
        assert_eq!(yuan_to_cn(10), "壹拾");
        assert_eq!(yuan_to_cn(105), "壹佰零伍");
        assert_eq!(yuan_to_cn(1010), "壹仟零壹拾");
        assert_eq!(yuan_to_cn(1000005), "壹佰万零伍");
        assert_eq!(yuan_to_cn(1000000), "壹佰万");
    }
}
