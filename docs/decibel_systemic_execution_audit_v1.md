# Decibel: Báo cáo sửa lỗi hệ thống

Ngày 6/11/2026, Asia/Bangkok. Sửa tại workspace hiện tại, branch
`chore/production-cleanup-v1`. Đây là kết quả sửa source/build cục bộ, không phải
xác nhận bot production đã nạp code. Workspace đã có nhiều sửa đổi chưa commit;
không quy toàn bộ diff hiện có thành thay đổi của lần này.

Không gọi venue, giao dịch, cancel thật, restart process, sửa Settings, session
hay journal production. Giữ nguyên `npm.cmd run decibel:production`. Các lệnh
lịch sử được xem là lịch sử terminal, không phải inventory đang mở.

## Nguyên nhân và sửa mới

1. **Preflight bị coi là bảo đảm replacement.**
   `evaluateDecibelReplacementDecisionV1` vẫn có thể cho cancel TP hợp lệ để
   tăng quantity hoặc đổi giá, dù adapter chỉ thực hiện cancel rồi place riêng.
   Maker rejection/unknown sau cancel có thể biến partial/full coverage thành 0.
   Đã chặn cancel thử thay TP thông thường. Quantity repair trả blocker
   `TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD`; reprice giữ TP.
   Canonical RISK_REDUCTION/SESSION_UNWIND vẫn có đường riêng theo policy cũ.
   Advisory giá tốt hơn không phải quyền hủy coverage.
2. **Tăng inventory không gắn với khả năng bảo vệ phần tăng thêm.**
   Đã chặn candidate tăng vị thế đang mở và chặn lại exact candidate tại
   `evaluateTradingDecision` khi không có reduction contract được kiểm chứng.
   Production hiện không có producer chứng minh contract nhiều reduce-only.
   Vì vậy DCA sẽ bị chặn bởi admission trong trường hợp này; không thay tham số,
   công thức hay chiến lược DCA. Flat entry không bị chặn bởi riêng chốt này.
3. **Workflow báo coverage chỉ dựa vào tuổi dữ liệu.**
   Đã yêu cầu inventory hữu hạn, direction proven, đúng subaccount và network
   trước khi tính/report verified coverage. Dữ liệu không xác thực trả BLOCKED
   và quantity=null; NaN không đi vào phép chuyển lot.

Các sửa trước đã có trong workspace được giữ nguyên: tách TP khỏi entry funding,
margin tiers và target-volume; ưu tiên reducing action; journal claim trước gọi
executor; reconciliation theo exact identity; ACK không tính coverage; clock
monotonic và batch publication. Không viết lại các cơ chế này.

## Đường production đã truy vết

`run_decibel_production_bootstrap_v1.mjs` → web launcher →
`run_decibel_production_web_v1.ts` → live orchestrator/source/lifecycle/executor.

| Chuyển trạng thái | Hàm/module và nguồn sự thật |
| --- | --- |
| LONG/SHORT → candidate | `evaluateAuthenticatedSnapshot` / `evaluateWithFlatPairCohort` → authenticated recycling; market state, fair price, smart ladder, regime/cost và inventory constraints |
| Candidate → ENTRY/TP/defensive | `evaluateTradingDecision`, `assessDecibelTPActionV1`, `coordinateDecibelInventoryExitV1`; exact action, fresh authenticated position/basis, giới hạn của chính action |
| Arbitration → mutation | `selectMutation`, `evaluateDecibelReplacementDecisionV1`; safety cancel trước, reducing place trước entry, replacement không được xóa TP chỉ vì preflight đạt |
| Admission → submission | `validateDecibelFinalMakerAdmissionV1` → lifecycle durable claim → external executor; PostOnly/reduce-only, danh tính client và outcome riêng |
| FILL → vị thế | authenticated fill ledger + `applyFill`, reconciliation fill provenance; identity/quantity conflict bị từ chối, lot arithmetic; không lấy ACK làm fill |
| ACK → coverage | exact authenticated OPEN/PARTIAL_FILL và remaining quantity qua `calculateDecibelExitCoverageV1`; pending intent chỉ reserve, không chứng minh coverage |
| CANCEL → recovery | cancel intent và place owner được giữ trong journal; terminal identity giải phóng reservation; fresh position/orders/basis reauthorize replacement |
| Restart/disconnect | durable journal → authoritative reconciliation → atomic source snapshot; unknown không được retry chỉ vì timeout/absence/flat projection |

Các endpoint account/orders/fills không phải snapshot giao dịch nguyên tử của
venue. Clock/window và final refresh giảm mâu thuẫn, không loại bỏ mọi race trên
venue. Coverage là bằng chứng order đang resting, không phải bảo đảm sẽ fill.

## LONG/SHORT

Không chứng minh được sign error mới trong đường đã kiểm tra. BUY dùng
fair-minus-price, SELL dùng price-minus-fair. Long pressure giảm reservation
price và size phía tăng long; short phản chiếu. BUY floor tại/bên dưới best bid,
SELL ceil tại/bên trên best ask giữ maker quoting. Đây là thiên lệch inventory
có chủ đích, được giữ nguyên; phí/adverse-selection theo side có thể tạo kết quả
không đối xứng hợp lý.

Arbitration ưu tiên giảm inventory rồi edge, hòa thì đổi BUY/SELL theo parity
cycle; không có always-LONG trong selector production này. Parity không bảo đảm
hai phía được fill bằng nhau và có thể tương quan với chu kỳ NO_OP. Không đổi
policy này khi chưa chứng minh nó là lỗi. Test DCA/strategy cần contract nhiều TP
được ghi rõ `FAKE_VENUE_CONTRACT_ONLY`, không gán contract đó cho Decibel thật.

## Bằng chứng và mức kiểm chứng

| Mức | Kết quả / giới hạn |
| --- | --- |
| Code theo test | Production-core không có lỗi logic giao dịch trong lần chạy cuối; test mới chặn DCA ở candidate/final admission cả LONG/SHORT và chặn coverage với direction/account/network/NaN không xác thực |
| Replay journal sao chép | SQLite `backup` từ handle readonly tạo `data/systemic_audit/execution_copy.sqlite`, quick_check=ok. Phát lại 611 fill đã lưu, đóng/mở journal bản sao rồi phát lại: ledger không đổi; cùng ID khác giá bị từ chối. Không suy ra vị thế venue từ ledger lịch sử |
| Replay vòng đời | Các suite hiện có chạy actual orchestrator/lifecycle/real adapter với fake write client: partial fill, cancel finality/race, unknown outcome, terminal rejection, restart, stale read và reconnect. Chỉ tiến triển khi có exact authoritative evidence; không giả lập ACK thành coverage |
| Decibel thật | Lần này không gọi venue. Journal sao chép xác nhận cancel TP 0.00128 @ 80847.3 rồi PLACE 0.00068 @ 78826.9; cả hai có status lịch sử CANCELLED_EXTERNALLY. Điều đó chứng minh chuỗi local intent, không chứng minh venue đang mở lệnh hay code sửa đã chạy mainnet |
| Chưa chứng minh | Atomic amend/replace giữ coverage, nhiều reduce-only cùng vị thế qua toàn bộ owner/admission, protective execution/fill guarantee, mọi tick/response của các incident cũ |

Không suy từ primary key hoặc số test sang khẳng định đã thu nhận đủ mọi fill
trên venue. Exactly-once ở đây phụ thuộc canonical fill identity và dữ liệu lịch
sử đầy đủ; mất endpoint/history vẫn cần reconciliation.

## Giới hạn venue và quyết định vận hành

SDK cài tại workspace là 0.7.0. `write.d.ts` có `isReduceOnly`, PostOnly và các
tham số TP/SL tùy chọn; production write interface hiện dùng place/cancel riêng,
không truyền attached SL. Sự tồn tại của field SDK không chứng minh hiệu lực
stop-loss, nhiều reduce-only hay thay thế nguyên tử trên Decibel thật.

Chốt mới ưu tiên giữ TP đang xác thực và không tăng inventory khi chưa có cách
bảo vệ phần tăng thêm. Nó có thể để partial TP chưa được sửa hoặc giữ TP xa giá;
status không được gọi đó là full protection. Khi thiếu economics hoặc evidence,
ordinary TP không được tự đổi thành lệnh chốt lỗ. Maker-only không bảo đảm thoát
ngay khi chạm Max Loss, đặc biệt khi mất kết nối.

Người vận hành cần quyết định, ngoài phạm vi tự sửa lần này:

- Có tiếp tục yêu cầu tăng inventory trước khi chứng minh được cơ chế bảo vệ
  không phá TP cũ hay không. Contract nhiều TP đơn thuần chưa đủ: single-owner
  guard hiện vẫn có thể chặn additive order; cần chứng minh toàn đường trước khi
  cho production producer cấp quyền. Không bật bằng một flag giả định.
- Cách đáp ứng stop-loss cho **mọi vị thế mới**, gồm flat entry: adapter hiện
  chưa chứng minh attached stop hoặc stop thực thi trên venue. Không xem TP hay
  session Max Loss là bằng chứng đã có stop-loss cho từng vị thế.
- Nếu yêu cầu bảo đảm thoát tức thời thì phải quyết định policy thực thi phù hợp;
  không tự thay maker-only, DCA, Max Loss, leverage hoặc economics TP để đạt nó.

## Kiểm tra

| Lệnh | Kết quả |
| --- | --- |
| `npm.cmd run format:check` | Không đạt: `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts` có sẵn; không sửa/xóa scratch của người dùng |
| `npm.cmd run lint` | Không đạt: project-service không nhận hai scratch `.tmp_conflict_readonly.cjs`, `.tmp_exact_evidence.ts`; lint các source/test sửa mới đạt |
| `npm.cmd run typecheck` | Đạt |
| `npm.cmd test` | Production-core: logic giao dịch đạt; hai test presentation lỗi Chromium GPU process. Chuỗi `&&` không chạy tiếp hai suite cuối; đã chạy riêng authoritative reconciliation/HTTP và đạt |
| `npm.cmd run build` | Đạt |
| Targeted regression sau sửa cuối | Đạt: chốt position growth, evidence coverage và đường partial/cancel/unknown/restart/canonical |

Log và replay artifact cục bộ nằm trong `data/systemic_audit/` (đã được gitignore);
không đưa journal vào commit. Không sửa package script hay tăng timeout để che
failure. Kết quả này không tuyên bố mọi bất biến đã được Decibel thật xác minh,
hoặc bot đã sẵn sàng giao dịch không cần quyết định bảo vệ vị thế nêu trên.
