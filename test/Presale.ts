import { expect } from "chai";
import { ethers } from "hardhat";

describe('Presale Contract', async function () {
    let presale: any;
    let ect: any;
    let usdtMockInterface: any;
    let usdcMockInterface: any;
    let daiMockInterface: any;
    let owner: any;
    let investor1: any;
    let investor2: any;
    let wallet: any;
    let presaleSupply: any;

    const claimTimeInMilliSeconds = new Date("2024-10-19T09:00:00Z"); //5min after deployment
    const claimTime = Math.floor(claimTimeInMilliSeconds.getTime() / 1000);
    const presaleTokenPercent = 10;

    const ECTAddress = "0x6F5434460652a0F1bc20a6726d0d55c4B369367f";
    const presaleAddress = "0xcf873e8d5CEB98C04Db98dcA0744CC6D72b20d38";

    const SEPOLIA_USDT = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0"; // Checksummed address for USDT
    const SEPOLIA_USDC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Checksummed address for USDC
    const SEPOLIA_DAI = "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357"; // Checksummed address for DAI

    before(async function () {
        [owner, investor1, investor2, wallet] = await ethers.getSigners();

        //Attach ECT token contract
        const ECT = await ethers.getContractFactory("ECT");
        ect = ECT.attach(ECTAddress); // Attach to the existing contract

        //Attach Presale contract
        const Presale = await ethers.getContractFactory("Presale");
        presale = Presale.attach(presaleAddress);

        presaleSupply = (await ect.totalSupply()) * BigInt(presaleTokenPercent) / BigInt(100);

        await ect.connect(owner).approve(presaleAddress, presaleSupply);

        const tx = await presale.connect(owner).transferTokensToPresale(presaleSupply);
        await tx.wait();

        const erc20Mock = await ethers.getContractFactory("ERC20Mock");
        usdtMockInterface = erc20Mock.attach(SEPOLIA_USDT);
        usdcMockInterface = erc20Mock.attach(SEPOLIA_USDC);
        daiMockInterface = erc20Mock.attach(SEPOLIA_DAI);

        await usdtMockInterface.connect(investor1).approve(presaleAddress, ethers.parseUnits("1000", 6));
        await usdtMockInterface.connect(investor2).approve(presaleAddress, ethers.parseUnits("10000", 6));

        await usdcMockInterface.connect(investor1).approve(presaleAddress, ethers.parseUnits("1000", 6));
        await usdcMockInterface.connect(investor2).approve(presaleAddress, ethers.parseUnits("10000", 6));

        await daiMockInterface.connect(investor1).approve(presaleAddress, ethers.parseUnits("1000", 18));
        await daiMockInterface.connect(investor2).approve(presaleAddress, ethers.parseUnits("10000", 18));
    });

    describe("Presale setup", function () {
        it("should set up presale correctly", async function () {
            expect(await presale.getFundsRaised()).to.equal(0);
            expect(await presale.tokensAvailable()).to.equal(presaleSupply);
        });
    });

    describe("Buying ECT with USDT", function () {
        it("should not allow investors spending usdt more than allowance", async function () {
            const tokenAmount = ethers.parseUnits("20000000", 18); //20,000,000 ECT token 1600usdt because token price is 0.00008usdt per token, exceeding allowance
            await expect(presale.connect(investor1).buyWithUSDT(tokenAmount))
                .to.be.revertedWith("Insufficient allowance set for the contract.");
        });

        it("should allow investors buying ECT tokens with USDT.", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 ECT token , 120usdt
            const usdtAmount = await presale.estimatedCoinAmountForTokenAmount(tokenAmount, usdtMockInterface);

            const investmentsforUserBeforeTx1 = await presale.getInvestments(investor1.address, SEPOLIA_USDT);
            const investmentsforUserBeforeTx2 = await presale.getInvestments(investor2.address, SEPOLIA_USDT);
            const fundsRaisedBeforeTx = await presale.getFundsRaised();
            const investorTokenBalanceBeforeTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceBeforeTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableBeforeTx = await presale.tokensAvailable();

            const tx1 = await presale.connect(investor1).buyWithUSDT(tokenAmount);
            await tx1.wait();
            const tx2 = await presale.connect(investor2).buyWithUSDT(tokenAmount);
            await tx2.wait();

            const investmentsforUserAfterTx1 = await presale.getInvestments(investor1.address, SEPOLIA_USDT);
            const investmentsforUserAfterTx2 = await presale.getInvestments(investor2.address, SEPOLIA_USDT);
            const fundsRaisedAfterTx = await presale.getFundsRaised();
            const investorTokenBalanceAfterTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceAfterTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableAfterTx = await presale.tokensAvailable();

            expect(investorTokenBalanceAfterTx1).to.equal(investorTokenBalanceBeforeTx1 + tokenAmount);
            expect(investorTokenBalanceAfterTx2).to.equal(investorTokenBalanceBeforeTx2 + tokenAmount);
            expect(tokensAvailableAfterTx).to.equal(tokensAvailableBeforeTx - BigInt(2) * tokenAmount);
            expect(investmentsforUserAfterTx1).to.equal(investmentsforUserBeforeTx1 + usdtAmount);
            expect(investmentsforUserAfterTx2).to.equal(investmentsforUserBeforeTx2 + usdtAmount);
            expect(fundsRaisedAfterTx).to.equal(fundsRaisedBeforeTx + usdtAmount * BigInt(2) / BigInt(1000000));
        });

        //Before presale starts
        it("should not allow investors buying ECT tokens before presale starts", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18);
            await expect(presale.connect(investor1).buyWithUSDT(tokenAmount))
                .to.be.revertedWith("Invalid time for buying the token.");
        });

        //After presale ends
        it("should not allow investors buying ECT tokens after presale ends", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18);
            await expect(presale.connect(investor1).buyWithUSDT(tokenAmount))
                .to.be.revertedWith("Invalid time for buying the token.");
        });

    });

    describe("Buying ECT with USDC", function () {
        it("should not allow investors spending usdc more than allowance", async function () {
            const tokenAmount = ethers.parseUnits("20000000", 18); //20,000,000 ECT token ~1600usdt because token price is 0.00008usdt per token, exceeding allowance
            await expect(presale.connect(investor1).buyWithUSDC(tokenAmount, usdcMockInterface)).to.be.revertedWith("Insufficient allowance set for the contract.")
        });

        it("should allow investors buying ECT tokens with USDC.", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 ECT tokens, 120usdt
            const usdcAmount = await presale.estimatedCoinAmountForTokenAmount(tokenAmount, usdcMockInterface);

            const investmentsforUserBeforeTx1 = await presale.getInvestments(investor1.address, SEPOLIA_USDC);
            const investmentsforUserBeforeTx2 = await presale.getInvestments(investor2.address, SEPOLIA_USDC);
            const fundsRaisedBeforeTx = await presale.getFundsRaised();
            const investorTokenBalanceBeforeTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceBeforeTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableBeforeTx = await presale.tokensAvailable();

            const tx1 = await presale.connect(investor1).buyWithUSDC(tokenAmount);
            await tx1.wait();
            const tx2 = await presale.connect(investor2).buyWithUSDC(tokenAmount);
            await tx2.wait();

            const investmentsforUserAfterTx1 = await presale.getInvestments(investor1.address, SEPOLIA_USDC);
            const investmentsforUserAfterTx2 = await presale.getInvestments(investor2.address, SEPOLIA_USDC);
            const fundsRaisedAfterTx = await presale.getFundsRaised();
            const investorTokenBalanceAfterTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceAfterTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableAfterTx = await presale.tokensAvailable();

            expect(investmentsforUserAfterTx1).to.equal(investmentsforUserBeforeTx1 + usdcAmount);
            expect(investmentsforUserAfterTx2).to.equal(investmentsforUserBeforeTx2 + usdcAmount);
            expect(fundsRaisedAfterTx).to.equal(fundsRaisedBeforeTx + usdcAmount * BigInt(2) / BigInt(1000000));
            expect(investorTokenBalanceAfterTx1).to.equal(investorTokenBalanceBeforeTx1 + tokenAmount);
            expect(investorTokenBalanceAfterTx2).to.equal(investorTokenBalanceBeforeTx2 + tokenAmount);
            expect(tokensAvailableAfterTx).to.equal(tokensAvailableBeforeTx - tokenAmount * BigInt(2));
        });

        //Before presale starts
        it("should not allow investors buying ECT tokens with USDC before presale starts", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 ECT tokens
            await expect(presale.connect(investor1).buyWithUSDC(tokenAmount)).to.be.revertedWith("Invalid time for buying the token.");
        });
        //After presale ends
        it("should not allow investors buying ECT tokens with USDC after presale ends.", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 ECT tokens
            await expect(presale.connect(investor2.buyWithUSDC(tokenAmount))).to.be.revertedWith("Invalid time for buying the token.");
        });
    });

    describe("Buying ECT with DAI", function () {
        it("should not allow spending dai more than allowance", async function () {
            const tokenAmount = ethers.parseUnits("20000000", 18); //20,000,000 ECT token ~1600usdt because token price is 0.00008usdt per token, exceeding allowance
            await expect(presale.connect(investor1).buyWithDAI(tokenAmount, daiMockInterface)).to.be.revertedWith("Insufficient allowance set for the contract.");
        });

        it("should allow investors to buy ECT tokens with DAI.", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 ECT token
            const daiAmount = await presale.estimatedCoinAmountForTokenAmount(tokenAmount, daiMockInterface);

            const investmentsforUserBeforeTx1 = await presale.getInvestments(investor1.address, SEPOLIA_DAI);
            const investmentsforUserBeforeTx2 = await presale.getInvestments(investor2.address, SEPOLIA_DAI);
            const fundsRaisedBeforeTx = await presale.getFundsRaised();
            const investorTokenBalanceBeforeTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceBeforeTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableBeforeTx = await presale.tokensAvailable();

            const tx1 = await presale.connect(investor1).buyWithDAI(tokenAmount);
            await tx1.wait();
            const tx2 = await presale.connect(investor2).buyWithDAI(tokenAmount);
            await tx2.wait();

            const investmentsforUserAfterTx1 = await presale.getInvestments(investor1.address, SEPOLIA_DAI);
            const investmentsforUserAfterTx2 = await presale.getInvestments(investor2.address, SEPOLIA_DAI);
            const fundsRaisedAfterTx = await presale.getFundsRaised();
            const investorTokenBalanceAfterTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceAfterTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableAfterTx = await presale.tokensAvailable();

            expect(investmentsforUserAfterTx1).to.equal(investmentsforUserBeforeTx1 + daiAmount);
            expect(investmentsforUserAfterTx2).to.equal(investmentsforUserBeforeTx2 + daiAmount);
            expect(fundsRaisedAfterTx).to.equal(fundsRaisedBeforeTx + daiAmount * BigInt(2) / BigInt(1000000000) / BigInt(1000000000));
            expect(investorTokenBalanceAfterTx1).to.equal(investorTokenBalanceBeforeTx1 + tokenAmount);
            expect(investorTokenBalanceAfterTx2).to.equal(investorTokenBalanceBeforeTx2 + tokenAmount);
            expect(tokensAvailableAfterTx).to.equal(tokensAvailableBeforeTx - tokenAmount * BigInt(2));
        });

        //Before presale starts
        it("should not allow investors buying ECT tokens with DAI before presale starts", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 ECT token
            await expect(presale.connect(investor1).buyWithDAI(tokenAmount)).to.be.revertedWith("Invalid time for buying the token.");
        });

        //After presale ends
        it("should not allow investors buying ECT tokens with DAI after presale ends", async function () {
            const tokenAmount = ethers.parseUnits("1500000", 18); //1,500,000 tokens
            await expect(presale.connect(investor1.address).buyWithDAI(tokenAmount)).to.be.revertedWith("Invalid time for buying the token.");
        })
    });

    describe("Buying ECT with ETH", function () {
        it("should allow investors buying ECT tokens with ETH.", async function () {
            const ethAmount = ethers.parseEther("0.1"); //0.2 eth
            const tokenAmount = await presale.estimatedTokenAmountAvailableWithETH(ethAmount);
            const usdtAmount = await presale.estimatedCoinAmountForTokenAmount(tokenAmount, usdtMockInterface);

            // const investmentsforUserBeforeTx1 = await presale.getInvestments(investor1.address, SEPOLIA_USDT);
            const investmentsforUserBeforeTx2 = await presale.getInvestments(investor2.address, SEPOLIA_USDT);
            const fundsRaisedBeforeTx = await presale.getFundsRaised();
            // const investorTokenBalanceBeforeTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceBeforeTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableBeforeTx = await presale.tokensAvailable();

            // const tx1 = await presale.connect(investor1).buyWithETH({ value: ethAmount });
            // await tx1.wait();
            const tx2 = await presale.connect(investor2).buyWithETH({ value: ethAmount });
            await tx2.wait();

            // const investmentsforUserAfterTx1 = await presale.getInvestments(investor1.address, SEPOLIA_USDT);
            const investmentsforUserAfterTx2 = await presale.getInvestments(investor2.address, SEPOLIA_USDT);
            const fundsRaisedAfterTx = await presale.getFundsRaised();
            // const investorTokenBalanceAfterTx1 = await presale.getTokenAmountForInvestor(investor1.address);
            const investorTokenBalanceAfterTx2 = await presale.getTokenAmountForInvestor(investor2.address);
            const tokensAvailableAfterTx = await presale.tokensAvailable();

            // expect(investmentsforUserAfterTx1).to.equal(investmentsforUserBeforeTx1 + usdtAmount);
            expect(investmentsforUserAfterTx2).to.equal(investmentsforUserBeforeTx2 + usdtAmount);
            expect(fundsRaisedAfterTx).to.equal(fundsRaisedBeforeTx + usdtAmount / BigInt(1000000));
            // expect(investorTokenBalanceAfterTx1).to.equal(investorTokenBalanceBeforeTx1 + tokenAmount);
            expect(investorTokenBalanceAfterTx2).to.equal(investorTokenBalanceBeforeTx2 + tokenAmount);
            expect(tokensAvailableAfterTx).to.equal(tokensAvailableBeforeTx - tokenAmount);
        });

        //Before presale starts
        it("should not allow investors buying ECT tokens before presale starts", async function () {
            await expect(presale.connect(investor1).buyWithETH({ value: ethers.parseEther("1") })).to.be.revertedWith("Invalid time for buying the token.")
        })
        //After presale ends
        it("should not allow investors buying ECT tokens after presal ends", async function () {
            await expect(presale.connect(investor1).buyWithETH({ value: ethers.parseEther("1") })).to.be.revertedWith("Invalid time for buying the token.");
        });
    });

    //After presale ends
    describe("Claim functionality", function () {
        before(async function () {
            // Set the claim time before each test
            const setClaimTimeTx = await presale.connect(owner).setClaimTime(claimTime);
            await setClaimTimeTx.wait();
        });

        //Before presale ends
        it("should revert if trying to claim tokens before claim time is set", async function () {
            await presale.connect(investor1).buyWithUSDT(ethers.parseUnits("1500000", 18));
            await expect(presale.connect(investor1).claim(investor1.address)).to.be.revertedWith("It's not claiming time yet.");
        });

        it("should correctly distribute bonus tokens among multiple early investors", async function () {
            expect(await presale.isEarlyInvestors(investor1.address)).to.be.true;
            expect(await presale.isEarlyInvestors(investor2.address)).to.be.true;
        });

        it("should allow investors to claim their tokens", async function () {
            const initialBalance = await ect.balanceOf(investor2.address);
            const tokenAmount = await presale.getTokenAmountForInvestor(investor2.address);
            const bonusTokenAmount = await presale.getBonusTokenAmount();

            const claimTx = await presale.connect(investor2).claim(investor2.address);
            await claimTx.wait();
            const finalBalance = await ect.balanceOf(investor2.address);

            expect(finalBalance - initialBalance).to.equal(tokenAmount + bonusTokenAmount);
            expect(await presale.getTokenAmountForInvestor(investor2.address)).to.equal(0);
            //Second claim
            await expect(presale.connect(investor2).claim(investor2.address))
                .to.be.revertedWith("No tokens claim.");
        });

        it("should revert if a non-owner tries to set the claim time", async function () {
            await expect(presale.connect(investor1).setClaimTime(claimTime)).to.be.revertedWithCustomError(presale, "NotOwner");
        });
    });

    //After presale ends
    describe("Withdraw functionality", function () {
        before(async function () {
            const setWalletTx = await presale.connect(owner).setWallet(wallet.address);
            await setWalletTx.wait();
        })

        it("should allow the owner to withdraw balance of contract to wallet after presale ends", async function () {
            const initialUSDTBalance = await usdtMockInterface.balanceOf(wallet.address);
            const initialUSDCBalance = await usdcMockInterface.balanceOf(wallet.address);
            const initialDAIBalance = await daiMockInterface.balanceOf(wallet.address);

            const usdtAmount = await usdtMockInterface.balanceOf(presaleAddress);
            const usdcAmount = await usdcMockInterface.balanceOf(presaleAddress);
            const daiAmount = await daiMockInterface.balanceOf(presaleAddress);

            const withdrawTx = await presale.connect(owner).withdraw();
            await withdrawTx.wait();

            const finalUSDTBalance = await usdtMockInterface.balanceOf(wallet.address);
            const finalUSDCBalance = await usdcMockInterface.balanceOf(wallet.address);
            const finalDAIBalance = await daiMockInterface.balanceOf(wallet.address);

            expect(finalUSDTBalance).to.equal(initialUSDTBalance + usdtAmount);
            expect(finalUSDCBalance).to.equal(initialUSDCBalance + usdcAmount);
            expect(finalDAIBalance).to.equal(initialDAIBalance + daiAmount);
        });

        it("should revert if non-owner tries to withdraw", async function () {
            await expect(presale.connect(investor1).withdraw()).to.be.revertedWithCustomError(presale, "NotOwner");
        });

        it("should revert if a non-owner tries to set the wallet", async function () {
            await expect(presale.connect(investor1).setWallet(wallet)).to.be.revertedWithCustomError(presale, "NotOwner");
        });

        //Before presale ends
        it("should revert if trying to withdraw before the presale ends", async function () {
            await expect(presale.connect(owner).withdraw())
                .to.be.revertedWith("Cannot withdraw because presale is still in progress.");
        })
    })

    //After presale ends
    describe("Refund Functionality", function () {
        it("should allow the owner to refund to investors if softcap is not reached", async function () {
            const investor1USDTInitialBalance = await usdtMockInterface.balanceOf(investor1.address);
            const investor2USDTInitialBalance = await usdtMockInterface.balanceOf(investor2.address);
            const investor1USDCInitialBalance = await usdcMockInterface.balanceOf(investor1.address);
            const investor2USDCInitialBalance = await usdcMockInterface.balanceOf(investor2.address);
            const investor1DAIInitialBalance = await daiMockInterface.balanceOf(investor1.address);
            const investor2DAIInitialBalance = await daiMockInterface.balanceOf(investor2.address);

            const investor1USDTAmount = await presale.getInvestments(investor1.address, usdtMockInterface);
            const investor2USDTAmount = await presale.getInvestments(investor2.address, usdtMockInterface);
            const investor1USDCAmount = await presale.getInvestments(investor1.address, usdcMockInterface);
            const investor2USDCAmount = await presale.getInvestments(investor2.address, usdcMockInterface);
            const investor1DAIAmount = await presale.getInvestments(investor1.address, daiMockInterface);
            const investor2DAIAmount = await presale.getInvestments(investor2.address, daiMockInterface);

            await usdtMockInterface.connect(investor1).approve(presaleAddress, investor1USDTAmount);
            await usdtMockInterface.connect(investor2).approve(presaleAddress, investor2USDTAmount);
            await usdcMockInterface.connect(investor1).approve(presaleAddress, investor1USDCAmount);
            await usdcMockInterface.connect(investor2).approve(presaleAddress, investor2USDCAmount);
            await daiMockInterface.connect(investor1).approve(presaleAddress, investor1DAIAmount);
            await daiMockInterface.connect(investor2).approve(presaleAddress, investor2DAIAmount);

            const tx = await presale.connect(owner).refund();
            await tx.wait();

            const investor1USDTFinalBalance = await usdtMockInterface.balanceOf(investor1.address);
            const investor2USDTFinalBalance = await usdtMockInterface.balanceOf(investor2.address);
            const investor1USDCFinalBalance = await usdcMockInterface.balanceOf(investor1.address);
            const investor2USDCFinalBalance = await usdcMockInterface.balanceOf(investor2.address);
            const investor1DAIFinalBalance = await daiMockInterface.balanceOf(investor1.address);
            const investor2DAIFinalBalance = await daiMockInterface.balanceOf(investor2.address);

            expect(investor1USDTFinalBalance).to.equal(investor1USDTInitialBalance + investor1USDTAmount);
            expect(investor2USDTFinalBalance).to.equal(investor2USDTInitialBalance + investor2USDTAmount);
            expect(investor1USDCFinalBalance).to.equal(investor1USDCInitialBalance + investor1USDCAmount);
            expect(investor2USDCFinalBalance).to.equal(investor2USDCInitialBalance + investor2USDCAmount);
            expect(investor1DAIFinalBalance).to.equal(investor1DAIInitialBalance + investor1DAIAmount);
            expect(investor2DAIFinalBalance).to.equal(investor2DAIInitialBalance + investor2DAIAmount);
        });

        it("should revert if non-owner tries to refund", async function () {
            await expect(presale.connect(investor1).refund())
                .to.be.revertedWithCustomError(presale, "NotOwner");
        });

        //After presale ends
        it("should revert if trying to refund before the presale ends", async function () {
            await expect(presale.connect(owner).refund())
                .to.be.revertedWith("Cannot refund because presale is still in progress.");
        })
    });
})