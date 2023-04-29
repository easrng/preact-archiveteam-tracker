# preact-archiveteam-tracker
i rewrote the archiveteam tracker

## changes
 - remove jquery
   - `$(...).click(...)` to `document.querySelector(...).addEventListener("click", ...)`
   - `$.getJSON` to `fetch`
   - `$element.animate` to `element.animate` where supported, gracefully degrading to no animation otherwise
 - switch to preact for the left tables and queuestats to avoid element recreation on every rerender (seems like better perf in limited testing i did, but also means you can actually copy text from them. revolutionary!)
 - make show all / show fewer instant
 - 73.17 kB saved overall
