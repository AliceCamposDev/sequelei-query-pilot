use sequelei_desktop::ping;

#[test]
fn ping_command_returns_pong() {
    assert_eq!(ping(), "pong");
}
