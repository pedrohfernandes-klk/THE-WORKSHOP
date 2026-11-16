# Reproduce startup measurements

Run `npm install`, then `node tools/startup-baseline.mjs . medium` on Windows with Chrome installed. Use high/low as the final argument for other tiers. The runner serves localhost, opens Chrome headlessly on the actual available GPU (reported), disables HTTP cache, throttles to20 Mbit/s and records the Hall entry mark, click, first10s frame gaps, long tasks and resource timing. It walks W+D after the introductory flight. Set STARTUP_CPU_PROFILE=0 and STARTUP_TRACE=0 for low-instrumentation capture; set OUTPUT_PREFIX for JSON/PNG output. STARTUP_WAIT_CAMPUS=1 adds up to180s for campus readiness. Driver shader cache is not cleared.

`node tests/startup-budget.mjs report.json --maxEntryRequests=80 --maxEntryJSKB=2500` checks explicit data budgets together with defaults2s entry,100ms longtask,50ms frame gap. A failed performance gate must not be reported as a passed gameplay test. npm test tests the measuring logic; it does not assert measured performance.

resourceWindows separates requests STARTED before entry-ready and before the click. Bytes are full transfer sizes of those requests, not a measurement of bytes received by that instant. LongTask durations and frame gaps are different measurements. renderer.info.render from post-processing can show only its last pass; do not claim it is total campus draw calls.

Use installStartupMeasure from startup-measure.js as a browser init script before navigation; past frame gaps cannot be reconstructed by pasting after startup. The final DADOS idle300/proximity revision needs its own fresh measurement; the included observations identify their exact candidate scope.
