use shep_domain::TaskState::{self, Merged, NeedsYou, Queued, Ready, Working};

const ALLOWED: [(TaskState, TaskState); 6] = [
    (Queued, Working),
    (Working, NeedsYou),
    (Working, Ready),
    (NeedsYou, Working),
    (Ready, Working),
    (Ready, Merged),
];

#[test]
fn only_the_six_lifecycle_transitions_are_allowed() {
    for from in TaskState::ALL {
        for to in TaskState::ALL {
            let expected = ALLOWED.contains(&(from, to));
            assert_eq!(from.can_move_to(to), expected, "{from:?} -> {to:?}");
        }
    }
}

#[test]
fn merged_is_final() {
    assert!(TaskState::ALL.iter().all(|&to| !Merged.can_move_to(to)));
}

#[test]
fn states_have_the_user_facing_names() {
    let names: Vec<String> = TaskState::ALL.iter().map(ToString::to_string).collect();
    assert_eq!(names, ["Queued", "Working", "Needs you", "Ready", "Merged"]);
}
