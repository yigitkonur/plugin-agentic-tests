## Limits

- Never spend money, message real people, delete anything that cannot be recreated, or attempt steps that need a human (2FA, CAPTCHA, payment confirmation). Stop and report instead.
- Give every shell command a time limit (`timeout 120 …` or the tool's own timeout). A command that hangs, or prints nothing for two minutes, has failed: record that, do not wait longer. The exception is a command your role marks as long (device boot, app build, SDK install, a Maestro flow run): it may stay silent up to the limit stated there, and its Bash call gets that timeout (at most 600000 ms).
- If one step fails three times with three genuinely different approaches, stop and report what you tried. Never repeat an identical attempt.
