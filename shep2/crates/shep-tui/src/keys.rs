//! Keys typed while attached, as the bytes a terminal would send.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

const ESC: u8 = 0x1b;
const DEL: u8 = 0x7f;
const CTRL_MASK: u8 = 0x1f;

pub fn to_bytes(key: KeyEvent) -> Option<Vec<u8>> {
    let csi = |end: u8| Some(vec![ESC, b'[', end]);
    match key.code {
        KeyCode::Char(c) if key.modifiers.contains(KeyModifiers::CONTROL) && c.is_ascii() => {
            u8::try_from(c).ok().map(|b| vec![b & CTRL_MASK])
        }
        KeyCode::Char(c) => Some(c.to_string().into_bytes()),
        KeyCode::Enter => Some(vec![b'\r']),
        KeyCode::Tab => Some(vec![b'\t']),
        KeyCode::Backspace => Some(vec![DEL]),
        KeyCode::Esc => Some(vec![ESC]),
        KeyCode::Up => csi(b'A'),
        KeyCode::Down => csi(b'B'),
        KeyCode::Right => csi(b'C'),
        KeyCode::Left => csi(b'D'),
        _ => None,
    }
}
