;; reward-distributor.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-CHALLENGE-NOT-FOUND u101)
(define-constant ERR-CHALLENGE-NOT-ENDED u102)
(define-constant ERR-POOL-EMPTY u103)
(define-constant ERR-INVALID-REWARD u104)
(define-constant ERR-TOKEN-TRANSFER-FAILED u105)
(define-constant ERR-INSUFFICIENT-POOL u106)
(define-constant ERR-ALREADY-DISTRIBUTED u107)
(define-constant ERR-INVALID-PARTICIPANT u108)
(define-constant ERR-CALCULATION-FAILED u109)
(define-constant ERR-INVALID-TARGET u110)

(define-data-var token-contract principal .esave-token)
(define-data-var calculator-contract principal .savings-calculator)
(define-data-var challenge-registry-contract principal .challenge-registry)
(define-data-var authority principal tx-sender)

(define-map challenge-rewards
  uint
  {
    total-pool: uint,
    distributed: bool,
    end-height: uint,
    target-percentage: uint
  }
)

(define-map participant-rewards
  { challenge-id: uint, participant: principal }
  { claimed: bool, amount: uint }
)

(define-read-only (get-challenge-reward (challenge-id uint))
  (map-get? challenge-rewards challenge-id)
)

(define-read-only (get-participant-reward (challenge-id uint) (participant principal))
  (map-get? participant-rewards { challenge-id: challenge-id, participant: participant })
)

(define-read-only (is-distributed (challenge-id uint))
  (match (map-get? challenge-rewards challenge-id)
    reward (get distributed reward)
    false
  )
)

(define-public (set-token-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (var-set token-contract new-contract)
    (ok true)
  )
)

(define-public (set-calculator-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (var-set calculator-contract new-contract)
    (ok true)
  )
)

(define-public (set-registry-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (var-set challenge-registry-contract new-contract)
    (ok true)
  )
)

(define-public (fund-challenge (challenge-id uint) (amount uint))
  (let (
    (current (default-to { total-pool: u0, distributed: false, end-height: u0, target-percentage: u0 } 
                 (map-get? challenge-rewards challenge-id)))
  )
    (asserts! (> amount u0) (err ERR-INVALID-REWARD))
    (try! (contract-call? (var-get token-contract) transfer amount tx-sender (as-contract tx-sender) none))
    (map-set challenge-rewards challenge-id
      (merge current { total-pool: (+ (get total-pool current) amount) })
    )
    (print { event: "challenge-funded", challenge-id: challenge-id, amount: amount })
    (ok true)
  )
)

(define-public (set-challenge-target (challenge-id uint) (target-percentage uint) (end-height uint))
  (let (
    (registry (var-get challenge-registry-contract))
    (exists (contract-call? registry get-challenge challenge-id))
  )
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some exists) (err ERR-CHALLENGE-NOT-FOUND))
    (asserts! (and (>= target-percentage u100) (<= target-percentage u10000)) (err ERR-INVALID-TARGET))
    (asserts! (> end-height block-height) (err ERR-INVALID-TARGET))
    (map-set challenge-rewards challenge-id
      {
        total-pool: (get total-pool (default-to { total-pool: u0, distributed: false, end-height: u0, target-percentage: u0 } 
                                (map-get? challenge-rewards challenge-id))),
        distributed: false,
        end-height: end-height,
        target-percentage: target-percentage
      }
    )
    (ok true)
  )
)

(define-public (distribute-rewards (challenge-id uint))
  (let (
    (reward-info (unwrap! (map-get? challenge-rewards challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
    (pool (get total-pool reward-info))
    (ended (get end-height reward-info))
    (target (get target-percentage reward-info))
    (registry (var-get challenge-registry-contract))
    (participants (contract-call? registry get-participants challenge-id))
  )
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get distributed reward-info)) (err ERR-ALREADY-DISTRIBUTED))
    (asserts! (>= block-height ended) (err ERR-CHALLENGE-NOT-ENDED))
    (asserts! (> pool u0) (err ERR-POOL-EMPTY))

    (fold distribute-to-participant
          participants
          { challenge-id: challenge-id, pool-remaining: pool, total-eligible-savings: u0 })

    (map-set challenge-rewards challenge-id
      (merge reward-info { distributed: true }))
    (print { event: "rewards-distributed", challenge-id: challenge-id })
    (ok true)
  )
)

(define-private (distribute-to-participant
  (participant principal)
  (context { challenge-id: uint, pool-remaining: uint, total-eligible-savings: uint }))
  (let (
    (challenge-id (get challenge-id context))
    (savings-result (contract-call? (var-get calculator-contract) get-savings-percentage participant challenge-id))
    (eligibility (contract-call? (var-get calculator-contract) get-eligibility-status participant challenge-id))
  )
    (match savings-result
      savings
        (match eligibility
          status
            (let (
              (eligible (get eligible status))
              (target (get target-percentage (unwrap! (map-get? challenge-rewards challenge-id) (err ERR-CHALLENGE-NOT-FOUND))))
            )
              (if (and eligible (>= savings target))
                (let (
                  (reward (/ (* (get pool-remaining context) savings) (+ (get total-eligible-savings context) savings)))
                  (key { challenge-id: challenge-id, participant: participant })
                )
                  (map-set participant-rewards key { claimed: false, amount: reward })
                  {
                    challenge-id: challenge-id,
                    pool-remaining: (- (get pool-remaining context) reward),
                    total-eligible-savings: (+ (get total-eligible-savings context) savings)
                  }
                )
                context
              )
            )
          context
        )
      context
    )
  )
)

(define-public (claim-reward (challenge-id uint))
  (let (
    (participant tx-sender)
    (reward-entry (unwrap! (map-get? participant-rewards { challenge-id: challenge-id, participant: participant })
                           (err ERR-INVALID-PARTICIPANT)))
    (amount (get amount reward-entry))
    (distributed (is-distributed challenge-id))
  )
    (asserts! distributed (err ERR-CHALLENGE-NOT-ENDED))
    (asserts! (not (get claimed reward-entry)) (err ERR-ALREADY-DISTRIBUTED))
    (asserts! (> amount u0) (err ERR-INVALID-REWARD))

    (try! (as-contract (contract-call? (var-get token-contract) transfer amount tx-sender participant none)))
    (map-set participant-rewards
      { challenge-id: challenge-id, participant: participant }
      (merge reward-entry { claimed: true }))
    (print { event: "reward-claimed", participant: participant, challenge-id: challenge-id, amount: amount })
    (ok amount)
  )
)