// challenge-registry.test.ts

import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CHALLENGE_NOT_FOUND = 102;
const ERR_CHALLENGE_ALREADY_EXISTS = 103;
const ERR_INVALID_TITLE = 104;
const ERR_INVALID_START_BLOCK = 106;
const ERR_INVALID_END_BLOCK = 107;
const ERR_PARTICIPANT_ALREADY_JOINED = 111;
const ERR_CHALLENGE_NOT_ACTIVE = 112;
const ERR_CHALLENGE_ENDED = 113;

interface Challenge {
  title: string;
  description: string;
  startBlock: number;
  endBlock: number;
  rewardPool: number;
  status: string;
  targetPercentage: number;
  creator: string;
}

interface Participant {
  joinedAt: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ChallengeRegistryMock {
  state: {
    nextChallengeId: number;
    authority: string;
    challenges: Map<number, Challenge>;
    participants: Map<string, Participant>;
  } = {
    nextChallengeId: 1,
    authority: "ST1TEST",
    challenges: new Map(),
    participants: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextChallengeId: 1,
      authority: "ST1TEST",
      challenges: new Map(),
      participants: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1TEST";
  }

  getKey(challengeId: number, participant: string): string {
    return `${challengeId}-${participant}`;
  }

  setAuthority(newAuthority: string): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.authority = newAuthority;
    return { ok: true, value: true };
  }

  createChallenge(
    title: string,
    description: string,
    startBlock: number,
    endBlock: number,
    rewardPool: number,
    targetPercentage: number
  ): Result<number> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (title.length === 0) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length === 0) return { ok: false, value: 105 };
    if (startBlock < this.blockHeight)
      return { ok: false, value: ERR_INVALID_START_BLOCK };
    if (endBlock <= startBlock)
      return { ok: false, value: ERR_INVALID_END_BLOCK };
    if (targetPercentage < 100 || targetPercentage > 10000)
      return { ok: false, value: 110 };

    const id = this.state.nextChallengeId;
    this.state.challenges.set(id, {
      title,
      description,
      startBlock,
      endBlock,
      rewardPool,
      status: "active",
      targetPercentage,
      creator: this.caller,
    });
    this.state.nextChallengeId++;
    return { ok: true, value: id };
  }

  updateChallenge(
    challengeId: number,
    title: string,
    description: string,
    rewardPool: number
  ): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (this.caller !== challenge.creator)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (title.length === 0) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length === 0) return { ok: false, value: 105 };

    this.state.challenges.set(challengeId, {
      ...challenge,
      title,
      description,
      rewardPool,
    });
    return { ok: true, value: true };
  }

  endChallenge(challengeId: number): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (this.caller !== this.state.authority)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.isEnded(challengeId))
      return { ok: false, value: ERR_CHALLENGE_ENDED };

    this.state.challenges.set(challengeId, { ...challenge, status: "ended" });
    return { ok: true, value: true };
  }

  joinChallenge(challengeId: number): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (!this.isActive(challengeId))
      return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    const key = this.getKey(challengeId, this.caller);
    if (this.state.participants.has(key))
      return { ok: false, value: ERR_PARTICIPANT_ALREADY_JOINED };

    this.state.participants.set(key, { joinedAt: this.blockHeight });
    return { ok: true, value: true };
  }

  leaveChallenge(challengeId: number): Result<boolean> {
    const key = this.getKey(challengeId, this.caller);
    if (!this.state.participants.has(key))
      return { ok: false, value: ERR_PARTICIPANT_ALREADY_JOINED };
    this.state.participants.delete(key);
    return { ok: true, value: true };
  }

  getChallenge(challengeId: number): Challenge | null {
    return this.state.challenges.get(challengeId) || null;
  }

  getParticipants(challengeId: number): string[] {
    const result: string[] = [];
    for (const [key, _] of this.state.participants) {
      const [cid, participant] = key.split("-");
      if (parseInt(cid) === challengeId) result.push(participant);
    }
    return result;
  }

  hasParticipant(challengeId: number, participant: string): boolean {
    return this.state.participants.has(this.getKey(challengeId, participant));
  }

  isActive(challengeId: number): boolean {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return false;
    return (
      this.blockHeight >= challenge.startBlock &&
      this.blockHeight <= challenge.endBlock &&
      challenge.status === "active"
    );
  }

  isEnded(challengeId: number): boolean {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return true;
    return (
      this.blockHeight > challenge.endBlock || challenge.status === "ended"
    );
  }
}

describe("ChallengeRegistry", () => {
  let contract: ChallengeRegistryMock;

  beforeEach(() => {
    contract = new ChallengeRegistryMock();
    contract.reset();
  });

  it("creates challenge successfully", () => {
    const result = contract.createChallenge(
      "Save 20%",
      "Reduce usage by 20%",
      100,
      200,
      10000,
      2000
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const challenge = contract.getChallenge(1);
    expect(challenge?.title).toBe("Save 20%");
    expect(challenge?.status).toBe("active");
    expect(contract.state.nextChallengeId).toBe(2);
  });

  it("rejects creation by non-authority", () => {
    contract.caller = "ST3FAKE";
    const result = contract.createChallenge(
      "Test",
      "Desc",
      100,
      200,
      10000,
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid start block", () => {
    const result = contract.createChallenge(
      "Test",
      "Desc",
      50,
      200,
      10000,
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_START_BLOCK);
  });

  it("rejects end before start", () => {
    const result = contract.createChallenge(
      "Test",
      "Desc",
      100,
      99,
      10000,
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_END_BLOCK);
  });

  it("updates challenge successfully", () => {
    contract.createChallenge("Old", "Desc", 100, 200, 10000, 2000);
    const result = contract.updateChallenge(1, "New Title", "New Desc", 20000);
    expect(result.ok).toBe(true);
    const challenge = contract.getChallenge(1);
    expect(challenge?.title).toBe("New Title");
    expect(challenge?.rewardPool).toBe(20000);
  });

  it("rejects update by non-creator", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.caller = "ST3FAKE";
    const result = contract.updateChallenge(1, "New", "Desc", 10000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("joins active challenge", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.blockHeight = 150;
    const result = contract.joinChallenge(1);
    expect(result.ok).toBe(true);
    expect(contract.hasParticipant(1, "ST1TEST")).toBe(true);
  });

  it("rejects join if not active", () => {
    contract.createChallenge("Test", "Desc", 200, 300, 10000, 2000);
    const result = contract.joinChallenge(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CHALLENGE_NOT_ACTIVE);
  });

  it("rejects double join", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.blockHeight = 150;
    contract.joinChallenge(1);
    const result = contract.joinChallenge(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PARTICIPANT_ALREADY_JOINED);
  });

  it("leaves challenge", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.blockHeight = 150;
    contract.joinChallenge(1);
    const result = contract.leaveChallenge(1);
    expect(result.ok).toBe(true);
    expect(contract.hasParticipant(1, "ST1TEST")).toBe(false);
  });

  it("ends challenge", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    const result = contract.endChallenge(1);
    expect(result.ok).toBe(true);
    const challenge = contract.getChallenge(1);
    expect(challenge?.status).toBe("ended");
  });

  it("rejects end by non-authority", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.caller = "ST3FAKE";
    const result = contract.endChallenge(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("returns participants list", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.blockHeight = 150;
    contract.caller = "ST2USER";
    contract.joinChallenge(1);
    contract.caller = "ST3USER";
    contract.joinChallenge(1);
    contract.caller = "ST1TEST";
    const participants = contract.getParticipants(1);
    expect(participants).toContain("ST2USER");
    expect(participants).toContain("ST3USER");
  });

  it("is-active returns correct status", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.blockHeight = 99;
    expect(contract.isActive(1)).toBe(false);
    contract.blockHeight = 150;
    expect(contract.isActive(1)).toBe(true);
    contract.blockHeight = 201;
    expect(contract.isActive(1)).toBe(false);
  });

  it("is-ended returns correct status", () => {
    contract.createChallenge("Test", "Desc", 100, 200, 10000, 2000);
    contract.blockHeight = 201;
    expect(contract.isEnded(1)).toBe(true);
    contract.endChallenge(1);
    expect(contract.isEnded(1)).toBe(true);
  });
});
