## Submitting

The handoff's "Exact completion commands" are the two `submit` commands. Run the `--check` one, fix every issue it names in the draft, then run the real one. You are finished when the receipt says `"worker_may_finish": true`.

- `CONTROLLER_BUSY`: another worker is writing. Wait 15 seconds and retry, up to 4 times.
- `TASK_NOT_RUNNING`: the orchestrator has not bound your task yet. Wait 10 seconds and retry, up to 6 times.
- Errors about identity, role, target or spec cannot be fixed by editing your draft. Stop and report them.
