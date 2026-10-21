## The browser you drive: ego-browser

`ego-browser` is your only browser. Never import Playwright or start another browser. This card is the whole API you may use; for one unfamiliar method call `help("<name>")` inside a script, or grep `<Helpers>/../runners/ego-browser/references/api.md` for that method (never read that file whole).

**How it runs here**
- The assignment names the browser host. `local` means `ego-browser` drives a browser on this machine. An ssh alias (for example `tugce`) means the `ego-browser` command here is an ssh wrapper: your script runs in Node.js on that host, next to the real browser. Either way, write screenshots to an absolute path under `/tmp/agentic-tests/<campaign_id>/<task_id>/` and bring them into the evidence folder with `pull-evidence.sh <browser host> …` (for `local` it copies). Your shell's environment variables never reach the script, and with a remote host local files are not visible to it.
- Always run scripts through the helper, never `ego-browser` directly:

  ```bash
  "$HELPERS/ego-run.sh" --log "/tmp/agentic-tests-<task_id>-ego.log" [--env FIXTURE_USER,FIXTURE_PASSWORD] <<'EOF' 2>&1 | tee "$EV/S01-snapshot.txt"
  const task = await taskSpace("<task_id> <case_id>");
  const page = task.page("p1");
  await page.goto("http://127.0.0.1:3000/");
  console.log(JSON.stringify({ spaceId: task.spaceId }));
  console.log(await page.snapshot());
  EOF
  ```

  The helper returns the script's own output (stdout and stderr merged), keeps the wrapper's `[ego-browser…]` lines in the log, retries a "preview setup is busy" answer, and exits 7 with the wrapper's message when the tunnel failed (record that as an execution gap, with the message). Any other non-zero exit is the script's own failure: read the error text in its output.
- Remote browser host only: a local app is reachable from it only through forwarded ports. Export the exact `EGO_FORWARD_PORTS` value the assignment gives before each helper call (`export EGO_FORWARD_PORTS="3000 8000"`); the wrapper accepts only the ports it was built for (the reference wrapper: 3000 3001 4173 4321 5000 5173 8000 8080 8081 8088 8090 8787 8788 8888 9000). Never add, change or guess ports; every worker in a campaign uses the identical value. With browser host `local` or a public URL, leave the variable unset.
- Credentials: `--env NAME1,NAME2` makes `ENV.NAME1` and `ENV.NAME2` available in your script (values travel on stdin only). Use `await page.fill("loc=role:textbox[name='Email']", ENV.FIXTURE_USER)`. Never print, log, screenshot, save or write `ENV` values anywhere; never type a secret's literal value into a script or a command.
- Each Bash call is a fresh shell: start every call with the assignments you need (`EV=…`, `HELPERS=…`, `export EGO_FORWARD_PORTS=…`).
- If the final output contains `[ego-browser:notice]` ignore it; never run `ego-browser upgrade`.

**Script basics.** The script is ESM Node.js with top-level `await`. Browser-side code goes inside `page.evaluate()`; `window`/`document` do not exist in the script. Load Node built-ins with `await import("node:fs/promises")`. The API is small and is not Playwright: do not use `locator()`, `getByRole()`, `context()`, `expect()` or `route()`. When the listed API cannot do something, use `page.evaluate()` or `page.cdp()`. All times are milliseconds.

**Spaces.** Create one TaskSpace for the whole task, print its `spaceId`, and resume it in later calls with `await taskSpace(<id>)` (every call is a new Node process: variables do not persist, spaces, tabs and page labels do). A new space starts with page `p1`: navigate it, reuse it. Never open a new space or page to recover from a stuck page; recover inside the space, and if you cannot, record the failure and stop. Never touch profiles. End with `await task.finish({ keep: [] })` exactly once, after your last capture; do not call it when you stop on an error.

**Observe.** `page.snapshot()` returns the accessibility tree of the viewport (`{ scope: "full_page" }` for all of it; `{ scope: "subtree", root: "@12" }` for an iframe's ref). Nodes carry refs such as `@21`. A snapshot is the current moment, not a wait. `page.screenshot({ path })` returns the path; open it later with Read to see it. `url()`, `title()`, `info()` give state. Observe the cheapest way that settles the next step: a snapshot for structure and text, a screenshot for what the user sees. After an action, inspect before you retry; never repeat blindly.

**Act.** `click`, `dblclick`, `hover`, `fill`, `selectOption(sel, {label})`, `focus`, `press`, `dragAndDrop`, `setInputFiles`. Targets: a snapshot ref (`@21`), `text=Save` (substring, case-insensitive) or `text="Save changes"` (exact), `loc=role:button[name='Sign in']` (also `[name*='part']`), `loc=css:#id`, `loc=href:/orders`, `xpath=…`, or plain CSS. A selector must match exactly one actionable element; when a name matches several, act on the ref. Quote names inside locators with single or escaped double quotes. Targets are scrolled into view for you. Plan several actions on one page, run them in one script, wait for the final expected state, and print the snapshot last.

**Wait for state, never for time.** `waitForURL(pattern)`, `waitForSelector(sel, { state: "visible" })`, `waitForFunction(() => cond, undefined, { timeout: 15000 })` (the second argument is the Page argument: pass `undefined`), `waitForLoadState()`. `waitForTimeout` only when nothing observable exists, and say why in the observation.

**Page code.** `page.evaluate(fnOrString, oneJsonArgument)` runs in the page and returns JSON; it has no timeout, keep it short. `page.fetch(url, options)` runs `window.fetch` in the page (cookies, CORS apply) and returns `{ ok, status, statusText, url, headers, body }`. `page.cdp(method, params)` sends a DevTools command (refs become invalid afterwards). Pointer and keyboard fallbacks for canvas-like pages: `page.mouse.click(x, y)`, `page.mouse.wheel(dx, dy)`, `page.keyboard.type(text)`, `page.keyboard.press("Enter")`.

**Popups and dialogs.** For a click that opens a page, arm first: `const popup = page.waitForEvent("popup"); await page.click(…); const p2 = await popup;`. A JavaScript dialog shows as `receipt.dialog` or in `page.info()`: `await page.acceptDialog("text")` or `await page.dismissDialog()`. A receipt only says the action was dispatched; it does not verify the resulting state.

**Clearing state.** Never run profile-wide clears (`Network.clearBrowserCookies`, `Network.clearBrowserCache`, `Storage.clearCookies` without a context): the browser profile is shared with its owner and cannot be restored. Clear one origin only: `await page.cdp("Storage.clearDataForOrigin", { origin, storageTypes: "all" })`. A stale document: `await page.cdp("Page.reload", { ignoreCache: true })`.

**Stops.** If the user took control of the space, the space is inactive, a browser permission prompt or device chooser appears, or a sign-in needs 2FA or a CAPTCHA, stop: capture the state, record it as a gap, and report. You cannot ask anyone.
