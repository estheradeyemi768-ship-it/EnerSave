# ⚡️ EnerSave: Blockchain-Powered Energy Conservation Challenges

Welcome to **EnerSave** — a Web3 platform that incentivizes real-world energy conservation through gamified challenges, verified by IoT smart meters, and rewarded with on-chain tokens. Built on **Stacks** using **Clarity**, this project turns energy savings into provable, tokenized impact.

## ✨ Features
🌍 **Real-World Impact** – Reduce carbon footprints via verifiable energy savings  
🔋 **Smart Meter Integration** – Pull real-time consumption data from IoT devices  
🏆 **Conservation Challenges** – Weekly/monthly goals (e.g., “Reduce usage by 15%”)  
💰 **Token Rewards** – Earn $ESAVE tokens proportional to verified savings  
📊 **Transparent Leaderboards** – Public, tamper-proof rankings  
✅ **Anti-Cheat Verification** – Baseline calibration + anomaly detection  
🔒 **Privacy-Preserving** – Only aggregated savings and hashes are on-chain  

## 🛠 How It Works

### **For Households / Participants**
1. **Connect Smart Meter** → Register your IoT device (via oracle or signed payload)  
2. **Establish Baseline** → First 7 days record normal usage  
3. **Join a Challenge** → Call `join-challenge` with challenge ID  
4. **Save Energy** → Your meter reports reduced kWh  
5. **Auto-Claim Rewards** → At challenge end, verified savings → mint $ESAVE  

### **For Utilities / Challenge Creators**
- Launch challenges with targets, duration, and reward pools  
- Fund challenges with STX or $ESAVE  
- View verified participant savings and environmental impact  

### **For Verifiers**
- Anyone can audit:  
  - Meter data hashes  
  - Baseline vs. challenge period  
  - Token minting logic  
  - No fake savings allowed  