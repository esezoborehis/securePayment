
;; Define constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-insufficient-balance (err u101))
(define-constant err-invalid-recipient (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-payment-exists (err u104))
(define-constant err-payment-not-found (err u105))
(define-constant err-unauthorized (err u106))

;; Define data maps
(define-map balances principal uint)
(define-map payments 
  { payment-id: uint } 
  { 
    sender: principal, 
    recipient: principal, 
    amount: uint,
    status: (string-ascii 20),
    timestamp: uint
  }
)
