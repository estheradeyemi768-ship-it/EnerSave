import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CHALLENGE_NOT_ACTIVE = 101;
const ERR_BASELINE_NOT_SET = 102;
const ERR_METER_DATA_MISSING = 103;
const ERR_INVALID_SAVINGS = 104;
const ERR_INVALID_KWH_READING = 105;
const ERR_INVALID_SIGNATURE = 106;
const ERR_MAX_DATA_POINTS_EXCEEDED = 116;
const ERR_INVALID_ORACLE = 117;
const ERR_INVALID_REGISTRY = 118;

interface Baseline {
  baselineKwh: number;
  blockHeight: number;
  dataPoints: number;
  totalKwh: number;
}

interface PeriodData {
  totalKwh: number;
  dataPoints: number;
  lastTimestamp: number;
}

interface Eligibility {
  eligible: boolean;
  savingsPercentage: number;
  timestamp: number;
}

interface AverageUsage {
  averageKwh: number;
}

interface Anomaly {
  anomalyCount: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class SavingsCalculatorMock {
  state: {
    oracleContract: string | null;
    registryContract: string | null;
    maxDataPoints: number;
    minKwhThreshold: number;
    maxKwhThreshold: number;
    baselineDuration: number;
    updateFee: number;
    authorityPrincipal: string;
    baselines: Map<string, Baseline>;
    challengePeriodData: Map<string, PeriodData>;
    eligibilityStatus: Map<string, Eligibility>;
    averageDailyUsage: Map<string, AverageUsage>;
    anomalyDetection: Map<string, Anomaly>;
  } = {
    oracleContract: null,
    registryContract: null,
    maxDataPoints: 100,
    minKwhThreshold: 10,
    maxKwhThreshold: 100000,
    baselineDuration: 7,
    updateFee: 100,
    authorityPrincipal: "ST1TEST",
    baselines: new Map(),
    challengePeriodData: new Map(),
    eligibilityStatus: new Map(),
    averageDailyUsage: new Map(),
    anomalyDetection: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  challengeActive: boolean = true;
  validSig: boolean = true;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      oracleContract: null,
      registryContract: null,
      maxDataPoints: 100,
      minKwhThreshold: 10,
      maxKwhThreshold: 100000,
      baselineDuration: 7,
      updateFee: 100,
      authorityPrincipal: "ST1TEST",
      baselines: new Map(),
      challengePeriodData: new Map(),
      eligibilityStatus: new Map(),
      averageDailyUsage: new Map(),
      anomalyDetection: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.challengeActive = true;
    this.validSig = true;
  }

  getKey(participant: string, challengeId: number): string {
    return `${participant}-${challengeId}`;
  }

  setOracleContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.oracleContract = contract;
    return { ok: true, value: true };
  }

  setRegistryContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.registryContract = contract;
    return { ok: true, value: true };
  }

  setMaxDataPoints(newMax: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxDataPoints = newMax;
    return { ok: true, value: true };
  }

  setMinKwhThreshold(newMin: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMin <= 0) return { ok: false, value: false };
    this.state.minKwhThreshold = newMin;
    return { ok: true, value: true };
  }

  setMaxKwhThreshold(newMax: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxKwhThreshold = newMax;
    return { ok: true, value: true };
  }

  setBaselineDuration(newDur: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newDur <= 0) return { ok: false, value: false };
    this.state.baselineDuration = newDur;
    return { ok: true, value: true };
  }

  setUpdateFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee <= 0) return { ok: false, value: false };
    this.state.updateFee = newFee;
    return { ok: true, value: true };
  }

  submitMeterReading(
    participant: string,
    challengeId: number,
    kwhReading: number,
    signature: Uint8Array
  ): Result<boolean> {
    if (!this.state.oracleContract)
      return { ok: false, value: ERR_INVALID_ORACLE };
    if (!this.state.registryContract)
      return { ok: false, value: ERR_INVALID_REGISTRY };
    if (
      kwhReading < this.state.minKwhThreshold ||
      kwhReading > this.state.maxKwhThreshold
    )
      return { ok: false, value: ERR_INVALID_KWH_READING };
    if (signature.length === 0)
      return { ok: false, value: ERR_INVALID_SIGNATURE };
    if (challengeId <= 0) return { ok: false, value: false };
    if (participant === this.caller) return { ok: false, value: false };
    if (!this.challengeActive)
      return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    if (!this.validSig) return { ok: false, value: ERR_INVALID_SIGNATURE };
    const key = this.getKey(participant, challengeId);
    if (!this.state.baselines.has(key))
      return { ok: false, value: ERR_BASELINE_NOT_SET };
    const currentPeriod = this.state.challengePeriodData.get(key) || {
      totalKwh: 0,
      dataPoints: 0,
      lastTimestamp: 0,
    };
    if (currentPeriod.dataPoints >= this.state.maxDataPoints)
      return { ok: false, value: ERR_MAX_DATA_POINTS_EXCEEDED };
    this.state.challengePeriodData.set(key, {
      totalKwh: currentPeriod.totalKwh + kwhReading,
      dataPoints: currentPeriod.dataPoints + 1,
      lastTimestamp: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  setBaseline(
    participant: string,
    challengeId: number,
    baselineKwh: number
  ): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (
      baselineKwh < this.state.minKwhThreshold ||
      baselineKwh > this.state.maxKwhThreshold
    )
      return { ok: false, value: ERR_INVALID_KWH_READING };
    if (challengeId <= 0) return { ok: false, value: false };
    if (participant === this.caller) return { ok: false, value: false };
    const key = this.getKey(participant, challengeId);
    const currentBaseline = this.state.baselines.get(key) || {
      baselineKwh: 0,
      blockHeight: 0,
      dataPoints: 0,
      totalKwh: 0,
    };
    this.state.baselines.set(key, {
      baselineKwh: baselineKwh,
      blockHeight: this.blockHeight,
      dataPoints: currentBaseline.dataPoints + 1,
      totalKwh: currentBaseline.totalKwh + baselineKwh,
    });
    return { ok: true, value: true };
  }

  updateEligibility(
    participant: string,
    challengeId: number,
    eligible: boolean
  ): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    const key = this.getKey(participant, challengeId);
    this.state.eligibilityStatus.set(key, {
      eligible,
      savingsPercentage: 0,
      timestamp: this.blockHeight,
    });
    this.stxTransfers.push({
      amount: this.state.updateFee,
      from: this.caller,
      to: this.state.authorityPrincipal,
    });
    return { ok: true, value: true };
  }

  calculateAverageUsage(
    participant: string,
    challengeId: number
  ): Result<number> {
    const key = this.getKey(participant, challengeId);
    const periodData = this.state.challengePeriodData.get(key);
    if (!periodData) return { ok: false, value: ERR_METER_DATA_MISSING };
    if (periodData.dataPoints === 0) return { ok: false, value: false };
    const average = Math.floor(periodData.totalKwh / periodData.dataPoints);
    if (average <= 0) return { ok: false, value: false };
    this.state.averageDailyUsage.set(key, { averageKwh: average });
    return { ok: true, value: average };
  }

  detectAnomaly(
    participant: string,
    challengeId: number,
    kwh: number
  ): Result<boolean> {
    const key = this.getKey(participant, challengeId);
    const baseline = this.state.baselines.get(key);
    if (!baseline) return { ok: false, value: ERR_BASELINE_NOT_SET };
    const diff = Math.abs(baseline.baselineKwh - kwh);
    const threshold = Math.floor((baseline.baselineKwh * 50) / 100);
    const currentAnomaly = this.state.anomalyDetection.get(key) || {
      anomalyCount: 0,
    };
    if (diff > threshold) {
      this.state.anomalyDetection.set(key, {
        anomalyCount: currentAnomaly.anomalyCount + 1,
      });
    }
    return { ok: true, value: true };
  }

  finalizeSavings(participant: string, challengeId: number): Result<number> {
    const savingsResult = this.getSavingsPercentage(participant, challengeId);
    if (!savingsResult.ok)
      return { ok: false, value: savingsResult.value as number };
    const savings = savingsResult.value as number;
    if (savings > 10000) return { ok: false, value: false };
    const key = this.getKey(participant, challengeId);
    const currentEligibility = this.state.eligibilityStatus.get(key) || {
      eligible: false,
      savingsPercentage: 0,
      timestamp: 0,
    };
    this.state.eligibilityStatus.set(key, {
      eligible: currentEligibility.eligible,
      savingsPercentage: savings,
      timestamp: this.blockHeight,
    });
    return { ok: true, value: savings };
  }

  getSavingsPercentage(
    participant: string,
    challengeId: number
  ): Result<number> {
    const key = this.getKey(participant, challengeId);
    const baseline = this.state.baselines.get(key);
    if (!baseline) return { ok: false, value: ERR_BASELINE_NOT_SET };
    const periodData = this.state.challengePeriodData.get(key);
    if (!periodData) return { ok: false, value: ERR_METER_DATA_MISSING };
    const saved =
      baseline.baselineKwh > periodData.totalKwh
        ? baseline.baselineKwh - periodData.totalKwh
        : 0;
    const percentage = Math.floor((saved * 10000) / baseline.baselineKwh);
    if (baseline.baselineKwh <= periodData.totalKwh)
      return { ok: false, value: ERR_INVALID_SAVINGS };
    return { ok: true, value: percentage };
  }
}

describe("SavingsCalculator", () => {
  let contract: SavingsCalculatorMock;

  beforeEach(() => {
    contract = new SavingsCalculatorMock();
    contract.reset();
  });

  it("sets oracle contract successfully", () => {
    const result = contract.setOracleContract("ST2ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oracleContract).toBe("ST2ORACLE");
  });

  it("rejects oracle set by non-authority", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setOracleContract("ST2ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets registry contract successfully", () => {
    const result = contract.setRegistryContract("ST3REG");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registryContract).toBe("ST3REG");
  });

  it("sets max data points successfully", () => {
    const result = contract.setMaxDataPoints(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxDataPoints).toBe(200);
  });

  it("rejects invalid max data points", () => {
    const result = contract.setMaxDataPoints(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("submits meter reading successfully", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.setRegistryContract("ST3REG");
    const key = contract.getKey("ST4PART", 1);
    contract.state.baselines.set(key, {
      baselineKwh: 1000,
      blockHeight: 0,
      dataPoints: 1,
      totalKwh: 1000,
    });
    const result = contract.submitMeterReading(
      "ST4PART",
      1,
      50,
      new Uint8Array(65)
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const period = contract.state.challengePeriodData.get(key);
    expect(period?.totalKwh).toBe(50);
    expect(period?.dataPoints).toBe(1);
    expect(period?.lastTimestamp).toBe(0);
  });

  it("rejects submit without oracle", () => {
    const result = contract.submitMeterReading(
      "ST4PART",
      1,
      50,
      new Uint8Array(65)
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ORACLE);
  });

  it("rejects invalid kwh reading", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.setRegistryContract("ST3REG");
    const result = contract.submitMeterReading(
      "ST4PART",
      1,
      5,
      new Uint8Array(65)
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_KWH_READING);
  });

  it("rejects max data points exceeded", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.setRegistryContract("ST3REG");
    const key = contract.getKey("ST4PART", 1);
    contract.state.baselines.set(key, {
      baselineKwh: 1000,
      blockHeight: 0,
      dataPoints: 1,
      totalKwh: 1000,
    });
    contract.state.challengePeriodData.set(key, {
      totalKwh: 0,
      dataPoints: 100,
      lastTimestamp: 0,
    });
    const result = contract.submitMeterReading(
      "ST4PART",
      1,
      50,
      new Uint8Array(65)
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_DATA_POINTS_EXCEEDED);
  });

  it("sets baseline successfully", () => {
    const result = contract.setBaseline("ST4PART", 1, 1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const key = contract.getKey("ST4PART", 1);
    const baseline = contract.state.baselines.get(key);
    expect(baseline?.baselineKwh).toBe(1000);
    expect(baseline?.blockHeight).toBe(0);
    expect(baseline?.dataPoints).toBe(1);
    expect(baseline?.totalKwh).toBe(1000);
  });

  it("rejects baseline by non-authority", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setBaseline("ST4PART", 1, 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates eligibility successfully", () => {
    const result = contract.updateEligibility("ST4PART", 1, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const key = contract.getKey("ST4PART", 1);
    const eligibility = contract.state.eligibilityStatus.get(key);
    expect(eligibility?.eligible).toBe(true);
    expect(eligibility?.savingsPercentage).toBe(0);
    expect(eligibility?.timestamp).toBe(0);
    expect(contract.stxTransfers).toEqual([
      { amount: 100, from: "ST1TEST", to: "ST1TEST" },
    ]);
  });

  it("calculates average usage successfully", () => {
    const key = contract.getKey("ST4PART", 1);
    contract.state.challengePeriodData.set(key, {
      totalKwh: 1000,
      dataPoints: 10,
      lastTimestamp: 0,
    });
    const result = contract.calculateAverageUsage("ST4PART", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(100);
    const average = contract.state.averageDailyUsage.get(key);
    expect(average?.averageKwh).toBe(100);
  });

  it("rejects average with no data", () => {
    const result = contract.calculateAverageUsage("ST4PART", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_METER_DATA_MISSING);
  });

  it("detects anomaly when threshold exceeded", () => {
    const key = contract.getKey("ST4PART", 1);
    contract.state.baselines.set(key, {
      baselineKwh: 1000,
      blockHeight: 0,
      dataPoints: 1,
      totalKwh: 1000,
    });
    const result = contract.detectAnomaly("ST4PART", 1, 400);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const anomaly = contract.state.anomalyDetection.get(key);
    expect(anomaly?.anomalyCount).toBe(1);
  });

  it("finalizes savings successfully", () => {
    const key = contract.getKey("ST4PART", 1);
    contract.state.baselines.set(key, {
      baselineKwh: 1000,
      blockHeight: 0,
      dataPoints: 1,
      totalKwh: 1000,
    });
    contract.state.challengePeriodData.set(key, {
      totalKwh: 800,
      dataPoints: 1,
      lastTimestamp: 0,
    });
    const result = contract.finalizeSavings("ST4PART", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2000);
    const eligibility = contract.state.eligibilityStatus.get(key);
    expect(eligibility?.savingsPercentage).toBe(2000);
  });

  it("rejects finalize with invalid savings", () => {
    const key = contract.getKey("ST4PART", 1);
    contract.state.baselines.set(key, {
      baselineKwh: 1000,
      blockHeight: 0,
      dataPoints: 1,
      totalKwh: 1000,
    });
    contract.state.challengePeriodData.set(key, {
      totalKwh: 1200,
      dataPoints: 1,
      lastTimestamp: 0,
    });
    const result = contract.finalizeSavings("ST4PART", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SAVINGS);
  });

  it("gets savings percentage successfully", () => {
    const key = contract.getKey("ST4PART", 1);
    contract.state.baselines.set(key, {
      baselineKwh: 1000,
      blockHeight: 0,
      dataPoints: 1,
      totalKwh: 1000,
    });
    contract.state.challengePeriodData.set(key, {
      totalKwh: 800,
      dataPoints: 1,
      lastTimestamp: 0,
    });
    const result = contract.getSavingsPercentage("ST4PART", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2000);
  });

  it("rejects savings percentage without baseline", () => {
    const result = contract.getSavingsPercentage("ST4PART", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BASELINE_NOT_SET);
  });

  it("parses challenge id with Clarity", () => {
    const cv = uintCV(1);
    expect(cv.value).toEqual(BigInt(1));
  });
});
