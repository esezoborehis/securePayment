;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-insufficient-balance (err u101))
(define-constant err-invalid-recipient (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-transaction-not-found (err u104))
(define-constant err-unauthorized (err u105))
(define-constant err-invalid-instrument (err u106))
(define-constant err-instrument-unavailable (err u107))
(define-constant err-invalid-rental-period (err u108))
(define-constant err-rental-expired (err u109))
(define-constant err-rental-active (err u110))
(define-constant err-invalid-status (err u111))

;; Transaction types
(define-constant TYPE-PURCHASE "purchase")
(define-constant TYPE-RENTAL "rental")
(define-constant TYPE-RENTAL-EXTENSION "extension")
(define-constant TYPE-RENTAL-RETURN "return")
(define-constant TYPE-DEPOSIT "deposit")

;; Status constants
(define-constant STATUS-PENDING "pending")
(define-constant STATUS-COMPLETED "completed")
(define-constant STATUS-CANCELLED "cancelled")
(define-constant STATUS-REFUNDED "refunded")
(define-constant STATUS-ACTIVE "active")
(define-constant STATUS-RETURNED "returned")
(define-constant STATUS-OVERDUE "overdue")

;; Data Maps
(define-map balances principal uint)

(define-map instruments 
  { instrument-id: uint }
  {
    name: (string-utf8 100),
    category: (string-ascii 50),
    daily-rental-fee: uint,
    purchase-price: uint,
    status: (string-ascii 20),
    owner: (optional principal),
    renter: (optional principal),
    rental-expiry: (optional uint)
  }
)

(define-map transactions
  { tx-id: uint }
  {
    user: principal,
    instrument-id: uint,
    amount: uint,
    type: (string-ascii 20),
    status: (string-ascii 20),
    rental-period-days: (optional uint),
    timestamp: uint,
    expiry: (optional uint)
  }
)
;; Data Variables
(define-data-var next-tx-id uint u1)
(define-data-var next-instrument-id uint u1)

;; Read-only Functions
(define-read-only (get-balance (user principal))
  (default-to u0 (map-get? balances user))
)

(define-read-only (get-transaction (tx-id uint))
  (map-get? transactions { tx-id: tx-id })
)

(define-read-only (get-instrument (instrument-id uint))
  (map-get? instruments { instrument-id: instrument-id })
)

(define-read-only (get-next-tx-id)
  (var-get next-tx-id)
)

(define-read-only (get-next-instrument-id)
  (var-get next-instrument-id)
)

(define-read-only (is-instrument-available (instrument-id uint))
  (let ((instrument (map-get? instruments { instrument-id: instrument-id })))
    (and 
      (is-some instrument)
      (is-eq (get status (unwrap! instrument { status: "none" })) "available")
    )
  )
)

(define-read-only (is-rental-active (instrument-id uint))
  (let ((instrument (map-get? instruments { instrument-id: instrument-id })))
    (and 
      (is-some instrument)
      (is-eq (get status (unwrap! instrument { status: "none" })) "rented")
      (>= (default-to u0 (get rental-expiry (unwrap! instrument { rental-expiry: none }))) block-height)
    )
  )
)
;; Administrative Functions
(define-public (register-instrument 
  (name (string-utf8 100)) 
  (category (string-ascii 50)) 
  (daily-rental-fee uint) 
  (purchase-price uint))
  
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (let ((instrument-id (var-get next-instrument-id)))
      (map-set instruments
        { instrument-id: instrument-id }
        {
          name: name,
          category: category,
          daily-rental-fee: daily-rental-fee,
          purchase-price: purchase-price,
          status: "available",
          owner: none,
          renter: none,
          rental-expiry: none
        }
      )
      (var-set next-instrument-id (+ instrument-id u1))
      (ok instrument-id)
    )
  )
)

(define-public (update-instrument-status (instrument-id uint) (new-status (string-ascii 20)))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (let ((instrument (unwrap! (get-instrument instrument-id) err-invalid-instrument)))
      (map-set instruments
        { instrument-id: instrument-id }
        (merge instrument { status: new-status })
      )
      (ok instrument-id)
    )
  )
)

;; Payment and Balance Functions
(define-public (deposit (amount uint))
  (begin
    (asserts! (> amount u0) err-invalid-amount)
    (let ((current-balance (get-balance tx-sender)))
      (map-set balances tx-sender (+ current-balance amount))
      
      ;; Record the deposit transaction
      (let ((tx-id (var-get next-tx-id)))
        (map-set transactions
          { tx-id: tx-id }
          {
            user: tx-sender,
            instrument-id: u0, ;; No specific instrument for deposits
            amount: amount,
            type: TYPE-DEPOSIT,
            status: STATUS-COMPLETED,
            rental-period-days: none,
            timestamp: block-height,
            expiry: none
          }
        )
        (var-set next-tx-id (+ tx-id u1))
        (ok tx-id)
      )
    )
  )
)

(define-public (purchase-instrument (instrument-id uint))
  (let ((instrument (unwrap! (get-instrument instrument-id) err-invalid-instrument))
        (price (get purchase-price instrument))
        (balance (get-balance tx-sender)))
    
    (asserts! (is-eq (get status instrument) "available") err-instrument-unavailable)
    (asserts! (>= balance price) err-insufficient-balance)
    
    (begin
      ;; Update user balance
      (map-set balances tx-sender (- balance price))
      
      ;; Update instrument ownership
      (map-set instruments
        { instrument-id: instrument-id }
        (merge instrument 
          { 
            status: "owned",
            owner: (some tx-sender),
            renter: none,
            rental-expiry: none
          }
        )
      )
      
      ;; Record transaction
      (let ((tx-id (var-get next-tx-id)))
        (map-set transactions
          { tx-id: tx-id }
          {
            user: tx-sender,
            instrument-id: instrument-id,
            amount: price,
            type: TYPE-PURCHASE,
            status: STATUS-COMPLETED,
            rental-period-days: none,
            timestamp: block-height,
            expiry: none
          }
        )
        (var-set next-tx-id (+ tx-id u1))
        (ok tx-id)
      )
    )
  )
)

(define-public (rent-instrument (instrument-id uint) (rental-days uint))
  (let ((instrument (unwrap! (get-instrument instrument-id) err-invalid-instrument))
        (daily-fee (get daily-rental-fee instrument))
        (total-fee (* daily-fee rental-days))
        (balance (get-balance tx-sender)))
    
    (asserts! (is-eq (get status instrument) "available") err-instrument-unavailable)
    (asserts! (>= balance total-fee) err-insufficient-balance)
    (asserts! (and (> rental-days u0) (<= rental-days u365)) err-invalid-rental-period)
    
    (begin
      ;; Update user balance
      (map-set balances tx-sender (- balance total-fee))
      
      ;; Update instrument status
      (map-set instruments
        { instrument-id: instrument-id }
        (merge instrument 
          { 
            status: "rented",
            renter: (some tx-sender),
            rental-expiry: (some (+ block-height (* rental-days u144))) ;; Approximately 144 blocks per day
          }
        )
      )
      
      ;; Record transaction
      (let ((tx-id (var-get next-tx-id))
            (expiry (+ block-height (* rental-days u144))))
        (map-set transactions
          { tx-id: tx-id }
          {
            user: tx-sender,
            instrument-id: instrument-id,
            amount: total-fee,
            type: TYPE-RENTAL,
            status: STATUS-ACTIVE,
            rental-period-days: (some rental-days),
            timestamp: block-height,
            expiry: (some expiry)
          }
        )
        (var-set next-tx-id (+ tx-id u1))
        (ok tx-id)
      )
    )
  )
)

(define-public (extend-rental (instrument-id uint) (additional-days uint))
  (let ((instrument (unwrap! (get-instrument instrument-id) err-invalid-instrument))
        (daily-fee (get daily-rental-fee instrument))
        (total-fee (* daily-fee additional-days))
        (balance (get-balance tx-sender))
        (current-renter (get renter instrument))
        (current-expiry (get rental-expiry instrument)))
    
    (asserts! (is-eq (get status instrument) "rented") err-instrument-unavailable)
    (asserts! (is-eq (some tx-sender) current-renter) err-unauthorized)
    (asserts! (is-some current-expiry) err-rental-expired)
    (asserts! (>= balance total-fee) err-insufficient-balance)
    (asserts! (and (> additional-days u0) (<= additional-days u365)) err-invalid-rental-period)
    
    (begin
      ;; Update user balance
      (map-set balances tx-sender (- balance total-fee))
      
      ;; Update instrument rental expiry
      (map-set instruments
        { instrument-id: instrument-id }
        (merge instrument 
          { 
            rental-expiry: (some (+ (unwrap! current-expiry u0) (* additional-days u144)))
          }
        )
      )
      
      ;; Record extension transaction
      (let ((tx-id (var-get next-tx-id))
            (new-expiry (+ (unwrap! current-expiry u0) (* additional-days u144))))
        (map-set transactions
          { tx-id: tx-id }
          {
            user: tx-sender,
            instrument-id: instrument-id,
            amount: total-fee,
            type: TYPE-RENTAL-EXTENSION,
            status: STATUS-COMPLETED,
            rental-period-days: (some additional-days),
            timestamp: block-height,
            expiry: (some new-expiry)
          }
        )
        (var-set next-tx-id (+ tx-id u1))
        (ok tx-id)
      )
    )
  )
)
(define-public (return-instrument (instrument-id uint))
  (let ((instrument (unwrap! (get-instrument instrument-id) err-invalid-instrument))
        (current-renter (get renter instrument)))
    
    (asserts! (is-eq (get status instrument) "rented") err-instrument-unavailable)
    (asserts! (is-eq (some tx-sender) current-renter) err-unauthorized)
    
    (begin
      ;; Update instrument status
      (map-set instruments
        { instrument-id: instrument-id }
        (merge instrument 
          { 
            status: "available",
            renter: none,
            rental-expiry: none
          }
        )
      )
      
      ;; Record return transaction
      (let ((tx-id (var-get next-tx-id)))
        (map-set transactions
          { tx-id: tx-id }
          {
            user: tx-sender,
            instrument-id: instrument-id,
            amount: u0,
            type: TYPE-RENTAL-RETURN,
            status: STATUS-COMPLETED,
            rental-period-days: none,
            timestamp: block-height,
            expiry: none
          }
        )
        (var-set next-tx-id (+ tx-id u1))
        (ok tx-id)
      )
    )
  )
)

;; System Functions
(define-public (mark-overdue-rentals)
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    ;; In a real implementation, this would iterate through instruments and mark overdue ones
    ;; For this example, we leave this as a placeholder function since Clarity doesn't support iteration
    (ok true)
  )
)
