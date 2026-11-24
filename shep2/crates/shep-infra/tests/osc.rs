use shep_domain::{AgentStatus, BlockKind};
use shep_infra::osc::{OscScanner, Report};

fn feed_all(chunks: &[&[u8]]) -> Vec<Report> {
    let mut scanner = OscScanner::default();
    chunks.iter().flat_map(|c| scanner.feed(c)).collect()
}

#[test]
fn a_status_report_is_read_with_either_terminator() {
    assert_eq!(
        feed_all(&[b"before\x1b]7501;state=working:app=claude-code\x1b\\after"]),
        [Report::Status(AgentStatus::Working)]
    );
    assert_eq!(
        feed_all(&[b"\x1b]7501;state=done\x07"]),
        [Report::Status(AgentStatus::Done)]
    );
}

#[test]
fn a_report_split_across_reads_is_still_read() {
    assert_eq!(
        feed_all(&[b"x\x1b", b"]75", b"01;state=id", b"le\x1b", b"\\"]),
        [Report::Status(AgentStatus::Idle)]
    );
}

#[test]
fn blocked_carries_its_kind_and_base64_message() {
    // "Which bucket?" in base64, padding left off as the protocol allows.
    assert_eq!(
        feed_all(&[b"\x1b]7501;kind=question:state=blocked:msg=V2hpY2ggYnVja2V0Pw\x07"]),
        [Report::Status(AgentStatus::Blocked {
            kind: Some(BlockKind::Question),
            message: Some("Which bucket?".into())
        })]
    );
    assert_eq!(
        feed_all(&[b"\x1b]7501;state=error:msg=Ym9vbQ==\x07"]),
        [Report::Status(AgentStatus::Error {
            message: Some("boom".into())
        })]
    );
}

#[test]
fn clear_child_records_queries_and_bad_reports_are_handled() {
    assert_eq!(feed_all(&[b"\x1b]7501;state=clear\x07"]), [Report::Clear]);
    let ignored: &[&[u8]] = &[
        b"\x1b]7501;state=working:id=deploy/us-east\x07",
        b"\x1b]7501;?\x07",
        b"\x1b]7501;state=sleeping\x07",
        b"\x1b]7501;app=x\x07",
        b"\x1b]7501;state=working:app=bad value\x07",
        b"\x1b]0;window title\x07",
        b"\x1b]75010;state=working\x07",
    ];
    for chunk in ignored {
        assert_eq!(feed_all(&[chunk]), [], "{}", String::from_utf8_lossy(chunk));
    }
}

#[test]
fn an_oversized_sequence_is_dropped_and_the_stream_recovers() {
    let mut big = b"\x1b]7501;state=working:msg=".to_vec();
    big.extend(std::iter::repeat_n(b'A', 5000));
    big.extend(b"\x07\x1b]7501;state=done\x07");
    assert_eq!(feed_all(&[&big]), [Report::Status(AgentStatus::Done)]);
}
