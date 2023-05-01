# preact archiveteam tracker
i rewrote the archiveteam tracker. preview for the imgur tracker at https://easrng.github.io/preact-archiveteam-tracker/imgur-demo.html, compare with https://tracker.archiveteam.org/imgur/. there shouldn't be any visible differences.

## changes
 - remove jquery
   - `$(...).click(...)` to `document.querySelector(...).addEventListener("click", ...)`
   - `$.getJSON` to `fetch`
   - `$element.animate` to `element.animate` where supported, gracefully degrading to no animation otherwise
 - use preact for rendering (for the log i only used it to create new lines to avoid diffing when new lines are added)
 - make show all / show fewer instant
 - `var` to `let`