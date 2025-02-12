const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECT Token Contract", function () {
  let ect: any;
  let ectName: string;
  let ectSymbol: string;
  let totalSupply: any;
  const ectAddress = "0xD3A5249BBca575B62988433F68ff455e423CF6C0";

  before(async function () {
    const ECT = await ethers.getContractFactory("ECT");
    ect = ECT.attach(ectAddress); // Attach to the existing contract
    ectName = await ect.name();
    ectSymbol = await ect.symbol();
    totalSupply = await ect.totalSupply();
  });

  it("Should have the correct name and symbol", async function () {
    expect(ectName).to.equal("ERC20 Token");
    expect(await ect.symbol()).to.equal("ECT");
  });

  it("Should have the correct total supply", async function () {
    const expectedSupply = ethers.parseUnits("100000000000", 18);
    expect(totalSupply.toString()).to.equal(expectedSupply.toString());
  });
});  
