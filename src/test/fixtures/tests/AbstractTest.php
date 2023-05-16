<?php

namespace Chiefmyron\TestWorkbench;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\Test;

abstract class AbstractTest extends TestCase
{
    /**
     * Check that a method prefixed with 'test' is not identified as a valid test in
     * the Test Explorer
     *
     * @return void
     */
    public function test_abstract()
    {

    }

    /**
     * Check that a method tagged with the '@test' annotation is not identified as a 
     * valid test in the Test Explorer
     * 
     * @test
     */
    public function abstractAnnotationTest()
    {

    }

    /**
     * Check that a method tagged with the 'PHPUnit\Framework\Attributes\Test' attribute 
     * is not identified as a valid test in the Test Explorer (new for PHPUnit 10 / PHP 8)
     */
    #[Test]
    public function abstractAttributeTest()
    {

    }
}
