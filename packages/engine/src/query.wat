;; Civic Engine — WebAssembly Text Format stub
;; Compile with: wat2wasm query.wat -o ../wasm/query.wasm
;;
;; This module will implement multi-column filter + sort over Float64Arrays
;; passed from WasmQuery.js via linear memory writes.
;;
;; Phase 1 (current): pure-JS fallback in wasm-query.js handles all queries.
;; Phase 2: implement _runWasm() ABI and wire these exports.

(module
  ;; Shared memory: host writes column data, WASM reads and writes result row indices
  (memory (export "memory") 16)  ;; 16 pages = 1 MB initial

  ;; Placeholder exports — implement in Phase 2
  ;; (func (export "query") (param $colPtr i32) (param $rowCount i32)
  ;;                        (param $filterPtr i32) (param $filterCount i32)
  ;;                        (result i32) ;; pointer to result index array
  ;;   unreachable
  ;; )
)
