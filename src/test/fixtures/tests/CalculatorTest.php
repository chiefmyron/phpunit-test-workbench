<?php

namespace Chiefmyron\TestWorkbench;

use PHPUnit\Framework\TestCase;

class CalculatorTest extends TestCase
{

    public function test_sum()
    {
        $calculator = new Calculator();

        $this->assertSame($calculator->sum(1, 2), 3);
    }

    public function test_sum_fail()
    {
        $calculator = new Calculator();

        $this->assertSame($calculator->sum(1, 2), 4);
    }

    public function test_sum_item()
    {
        $calculator = new Calculator();

        $a = new Item(1);
        $b = new Item(2);

        $this->assertSame($calculator->sumItem($a, $b), 3);
    }

    public function test_throw_exception()
    {
        $calculator = new Calculator();
        $calculator->throwException();
    }
}
