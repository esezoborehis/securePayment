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