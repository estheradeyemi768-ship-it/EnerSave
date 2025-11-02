;; challenge-registry.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CHALLENGE-ID u101)
(define-constant ERR-CHALLENGE-NOT-FOUND u102)
(define-constant ERR-CHALLENGE-ALREADY-EXISTS u103)
(define-constant ERR-INVALID-TITLE u104)
(define-constant ERR-INVALID-DESCRIPTION u105)
(define-constant ERR-INVALID-START-BLOCK u106)
(define-constant ERR-INVALID-END-BLOCK u107)
(define-constant ERR-INVALID-REWARD-POOL u108)
(define-constant ERR-INVALID-STATUS u109)
(define-constant ERR-INVALID-TARGET u110)
(define-constant ERR-PARTICIPANT-ALREADY-JOINED u111)
(define-constant ERR-CHALLENGE-NOT-ACTIVE u112)
(define-constant ERR-CHALLENGE-ENDED u113)
(define-constant ERR-INVALID-UPDATE u114)

(define-data-var next-challenge-id uint u1)
(define-data-var authority principal tx-sender)

(define-map challenges
  uint
  {
    title: (string-utf8 120),
    description: (string-utf8 500),
    start-block: uint,
    end-block: uint,
    reward-pool: uint,
    status: (string-ascii 20),
    target-percentage: uint,
    creator: principal
  }
)

(define-map participants
  { challenge-id: uint, participant: principal }
  { joined-at: uint }
)

(define-read-only (get-challenge (challenge-id uint))
  (map-get? challenges challenge-id)
)

(define-read-only (get-participants (challenge-id uint))
  (let (
    (challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
  )
    (filter
      (lambda (entry) true)
      (fold
        (lambda (p acc)
          (match (map-get? participants { challenge-id: challenge-id, participant: p })
            joined (concat acc (list p))
            acc
          )
        )
        (map-keys participants)
        (list)
      )
    )
  )
)

(define-read-only (has-participant (challenge-id uint) (participant principal))
  (is-some (map-get? participants { challenge-id: challenge-id, participant: participant }))
)

(define-read-only (is-active (challenge-id uint))
  (match (map-get? challenges challenge-id)
    challenge
      (and
        (>= block-height (get start-block challenge))
        (<= block-height (get end-block challenge))
        (is-eq (get status challenge) "active")
      )
    false
  )
)

(define-read-only (is-ended (challenge-id uint))
  (match (map-get? challenges challenge-id)
    challenge
      (or
        (> block-height (get end-block challenge))
        (is-eq (get status challenge) "ended")
      )
    true
  )
)

(define-public (set-authority (new-authority principal))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (var-set authority new-authority)
    (ok true)
  )
)

(define-public (create-challenge
  (title (string-utf8 120))
  (description (string-utf8 500))
  (start-block uint)
  (end-block uint)
  (reward-pool uint)
  (target-percentage uint)
)
  (let (
    (challenge-id (var-get next-challenge-id))
  )
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> (len title) u0) (err ERR-INVALID-TITLE))
    (asserts! (> (len description) u0) (err ERR-INVALID-DESCRIPTION))
    (asserts! (>= start-block block-height) (err ERR-INVALID-START-BLOCK))
    (asserts! (> end-block start-block) (err ERR-INVALID-END-BLOCK))
    (asserts! (>= reward-pool u0) (err ERR-INVALID-REWARD-POOL))
    (asserts! (and (>= target-percentage u100) (<= target-percentage u10000)) (err ERR-INVALID-TARGET))
    (asserts! (is-none (map-get? challenges challenge-id)) (err ERR-CHALLENGE-ALREADY-EXISTS))

    (map-set challenges challenge-id
      {
        title: title,
        description: description,
        start-block: start-block,
        end-block: end-block,
        reward-pool: reward-pool,
        status: "active",
        target-percentage: target-percentage,
        creator: tx-sender
      }
    )
    (var-set next-challenge-id (+ challenge-id u1))
    (print { event: "challenge-created", id: challenge-id, title: title })
    (ok challenge-id)
  )
)

(define-public (update-challenge
  (challenge-id uint)
  (title (string-utf8 120))
  (description (string-utf8 500))
  (reward-pool uint)
)
  (let (
    (challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
  )
    (asserts! (is-eq tx-sender (get creator challenge)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> (len title) u0) (err ERR-INVALID-TITLE))
    (asserts! (> (len description) u0) (err ERR-INVALID-DESCRIPTION))
    (asserts! (>= reward-pool u0) (err ERR-INVALID-REWARD-POOL))

    (map-set challenges challenge-id
      (merge challenge
        {
          title: title,
          description: description,
          reward-pool: reward-pool
        }
      )
    )
    (print { event: "challenge-updated", id: challenge-id })
    (ok true)
  )
)

(define-public (end-challenge (challenge-id uint))
  (let (
    (challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
  )
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-ended challenge-id)) (err ERR-CHALLENGE-ENDED))

    (map-set challenges challenge-id
      (merge challenge { status: "ended" })
    )
    (print { event: "challenge-ended", id: challenge-id })
    (ok true)
  )
)

(define-public (join-challenge (challenge-id uint))
  (let (
    (challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
  )
    (asserts! (is-active challenge-id) (err ERR-CHALLENGE-NOT-ACTIVE))
    (asserts! (not (has-participant challenge-id tx-sender)) (err ERR-PARTICIPANT-ALREADY-JOINED))

    (map-set participants
      { challenge-id: challenge-id, participant: tx-sender }
      { joined-at: block-height }
    )
    (print { event: "participant-joined", challenge-id: challenge-id, participant: tx-sender })
    (ok true)
  )
)

(define-public (leave-challenge (challenge-id uint))
  (let (
    (challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE-NOT-FOUND)))
  )
    (asserts! (is-active challenge-id) (err ERR-CHALLENGE-NOT-ACTIVE))
    (asserts! (has-participant challenge-id tx-sender) (err ERR-PARTICIPANT-ALREADY-JOINED))

    (map-delete participants { challenge-id: challenge-id, participant: tx-sender })
    (print { event: "participant-left", challenge-id: challenge-id, participant: tx-sender })
    (ok true)
  )
)