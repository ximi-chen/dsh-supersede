- [x] I added **one file** at `data/plugins/ximi-chen__dsh-supersede.yml` — that single file is the whole submission.
- [x] My repo's `package.json` declares **`dsh.bundle`** (`dsh.bundle.patch: ./cordis.patch.yml`, plus `dsh.client` for the browser half).
- [ ] My repo is at least **1 day old** — created `<YYYY-MM-DDTHH:MM:SSZ>`.
- [x] `category: ui` — it adds a composer control that changes how a queued message is delivered.
- [x] Description states what the plugin does, no superlatives.
- [ ] My repo has the `dsh-plugin` topic.

`dsh-supersede` adds a per-session **Supersede** switch to the left of the composer's tool row. With it on, sending a message while a turn is running cancels that turn and opens the next one with the message; the interrupted turn is labelled “Superseded by a new message”. A message sent while the session is idle starts its own turn exactly as stock. Two limits: the send button still says **Queue**, and the switch only works when **Busy Enter** is set to queue (with Steer it is disabled). Pure client bundle, no core package changes, no runtime dependencies; tests are `node --test client.core.test.js` (29 tests).
