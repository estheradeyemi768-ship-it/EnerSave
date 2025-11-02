// reward-distributor.test.ts

import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CHALLENGE_NOT_FOUND = 101;
const ERR_CHALLENGE_NOT_ENDED = 102;
const ERR_POOL_EMPTY = 103;
const ERR_INVALID_REWARD = 104;
const ERR_ALREADY_DISTRIBUTED = 107;
const ERR_INVALID_PARTICIPANT = 108;

interface ChallengeReward {
  totalPool: number;
  distributed: boolean;
  endHeight: number;
  targetPercentage: number;
}

interface ParticipantReward {
  claimed: boolean;
  amount: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class RewardDistributorMock {
  state: {
    tokenContract: string;
    calculatorContract: string;
    challengeRegistryContract: string;
    authority: string;
    challengeRewards: Map<number, ChallengeReward>;
    participantRewards: Map<string, ParticipantReward>;
  } = {
    tokenContract: ".esave-token",
    calculatorContract: ".savings-calculator",
    challengeRegistryContract: ".challenge-registry",
    authority: "ST1TEST",
    challengeRewards: new Map(),
    participantRewards: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";
  tokenTransfers: Array<{ amount: number; to: string }> = [];
  participants: string[] = ["ST2USER", "ST3USER"];
  savingsResults: Map<string, number> = new Map();
  eligibilityStatus: Map<string, boolean> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      tokenContract: ".esave-token",
      calculatorContract: ".savings-calculator",
      challengeRegistryContract: ".challenge-registry",
      authority: "ST1TEST",
      challengeRewards: new Map(),
      participantRewards: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1TEST";
    this.tokenTransfers = [];
    this.participants = ["ST2USER", "ST3USER"];
    this.savingsResults = new Map();
    this.eligibilityStatus = new Map();
  }

  getKey(challengeId: number, participant: string): string {
    return `${challengeId}-${participant}`;
  }

  setTokenContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.tokenContract = contract;
    return { ok: true, value: true };
  }

  setCalculatorContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.calculatorContract = contract;
    return { ok: true, value: true };
  }

  setRegistryContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.challengeRegistryContract = contract;
    return { ok: true, value: true };
  }

  fundChallenge(challengeId: number, amount: number): Result<boolean> {
    if (amount <= 0) return { ok: false, value: ERR_INVALID_REWARD };
    const current = this.state.challengeRewards.get(challengeId) || {
      totalPool: 0,
      distributed: false,
      endHeight: 0,
      targetPercentage: 0,
    };
    this.state.challengeRewards.set(challengeId, {
      ...current,
      totalPool: current.totalPool + amount,
    });
    return { ok: true, value: true };
  }

  setChallengeTarget(
    challengeId: number,
    targetPercentage: number,
    endHeight: number
  ): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (targetPercentage < 100 || targetPercentage > 10000)
      return { ok: false, value: false };
    if (endHeight <= this.blockHeight) return { ok: false, value: false };
    const current = this.state.challengeRewards.get(challengeId) || {
      totalPool: 0,
      distributed: false,
      endHeight: 0,
      targetPercentage: 0,
    };
    this.state.challengeRewards.set(challengeId, {
      ...current,
      endHeight,
      targetPercentage,
      distributed: false,
    });
    return { ok: true, value: true };
  }

  distributeRewards(challengeId: number): Result<boolean> {
    const rewardInfo = this.state.challengeRewards.get(challengeId);
    if (!rewardInfo) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (rewardInfo.distributed)
      return { ok: false, value: ERR_ALREADY_DISTRIBUTED };
    if (this.blockHeight < rewardInfo.endHeight)
      return { ok: false, value: ERR_CHALLENGE_NOT_ENDED };
    if (rewardInfo.totalPool === 0) return { ok: false, value: ERR_POOL_EMPTY };

    let poolRemaining = rewardInfo.totalPool;
    let totalEligibleSavings = 0;

    for (const participant of this.participants) {
      const key = this.getKey(challengeId, participant);
      const savings = this.savingsResults.get(key) || 0;
      const eligible = this.eligibilityStatus.get(key) || false;
      if (eligible && savings >= rewardInfo.targetPercentage) {
        totalEligibleSavings += savings;
      }
    }

    for (const participant of this.participants) {
      const key = this.getKey(challengeId, participant);
      const savings = this.savingsResults.get(key) || 0;
      const eligible = this.eligibilityStatus.get(key) || false;
      if (
        eligible &&
        savings >= rewardInfo.targetPercentage &&
        totalEligibleSavings > 0
      ) {
        const reward = Math.floor(
          (poolRemaining * savings) / totalEligibleSavings
        );
        this.state.participantRewards.set(key, {
          claimed: false,
          amount: reward,
        });
        poolRemaining -= reward;
      }
    }

    this.state.challengeRewards.set(challengeId, {
      ...rewardInfo,
      distributed: true,
    });
    return { ok: true, value: true };
  }

  claimReward(challengeId: number): Result<number> {
    const key = this.getKey(challengeId, this.caller);
    const rewardEntry = this.state.participantRewards.get(key);
    if (!rewardEntry) return { ok: false, value: ERR_INVALID_PARTICIPANT };
    const challenge = this.state.challengeRewards.get(challengeId);
    if (!challenge || !challenge.distributed)
      return { ok: false, value: ERR_CHALLENGE_NOT_ENDED };
    if (rewardEntry.claimed)
      return { ok: false, value: ERR_ALREADY_DISTRIBUTED };
    if (rewardEntry.amount <= 0)
      return { ok: false, value: ERR_INVALID_REWARD };

    this.tokenTransfers.push({ amount: rewardEntry.amount, to: this.caller });
    this.state.participantRewards.set(key, { ...rewardEntry, claimed: true });
    return { ok: true, value: rewardEntry.amount };
  }

  getChallengeReward(challengeId: number): ChallengeReward | null {
    return this.state.challengeRewards.get(challengeId) || null;
  }

  getParticipantReward(
    challengeId: number,
    participant: string
  ): ParticipantReward | null {
    return (
      this.state.participantRewards.get(
        this.getKey(challengeId, participant)
      ) || null
    );
  }
}

describe("RewardDistributor", () => {
  let contract: RewardDistributorMock;

  beforeEach(() => {
    contract = new RewardDistributorMock();
    contract.reset();
  });

  it("sets token contract successfully", () => {
    const result = contract.setTokenContract(".new-token");
    expect(result.ok).toBe(true);
    expect(contract.state.tokenContract).toBe(".new-token");
  });

  it("rejects token set by non-authority", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setTokenContract(".new-token");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("funds challenge successfully", () => {
    const result = contract.fundChallenge(1, 10000);
    expect(result.ok).toBe(true);
    const reward = contract.getChallengeReward(1);
    expect(reward?.totalPool).toBe(10000);
  });

  it("rejects zero funding", () => {
    const result = contract.fundChallenge(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REWARD);
  });

  it("sets challenge target successfully", () => {
    contract.fundChallenge(1, 10000);
    const result = contract.setChallengeTarget(1, 2000, 200);
    expect(result.ok).toBe(true);
    const reward = contract.getChallengeReward(1);
    expect(reward?.targetPercentage).toBe(2000);
    expect(reward?.endHeight).toBe(200);
  });

  it("rejects invalid target percentage", () => {
    const result = contract.setChallengeTarget(1, 50, 200);
    expect(result.ok).toBe(false);
  });
  
  it("excludes ineligible participants", () => {
    contract.fundChallenge(1, 10000);
    contract.setChallengeTarget(1, 1500, 150);
    contract.blockHeight = 160;

    contract.savingsResults.set("1-ST2USER", 3000);
    contract.savingsResults.set("1-ST3USER", 2000);
    contract.eligibilityStatus.set("1-ST2USER", true);
    contract.eligibilityStatus.set("1-ST3USER", false);

    contract.distributeRewards(1);

    const reward1 = contract.getParticipantReward(1, "ST2USER");
    const reward2 = contract.getParticipantReward(1, "ST3USER");

    expect(reward1?.amount).toBe(10000);
    expect(reward2).toBe(null);
  });

  it("rejects distribution if pool empty", () => {
    contract.setChallengeTarget(1, 1500, 150);
    contract.blockHeight = 160;
    const result = contract.distributeRewards(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_POOL_EMPTY);
  });

  it("rejects distribution before end", () => {
    contract.fundChallenge(1, 10000);
    contract.setChallengeTarget(1, 1500, 200);
    const result = contract.distributeRewards(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CHALLENGE_NOT_ENDED);
  });
});
