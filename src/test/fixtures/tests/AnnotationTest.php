<?php

namespace Chiefmyron\TestWorkbench;

use Chiefmyron\TestWorkbench\DataProviders\ExternalDataProvider;
use PHPUnit\Framework\TestCase;

class AnnotationTest extends TestCase
{
    /**
     * @test
     */
    public function hi(): void
    {
        self::assertTrue(true);
    }

    /**
     * @testdox Renamed test
     */
    public function testRename(): void
    {
        self::assertTrue(true);
    }

    /**
     * @dataProvider additionProvider
     */
    public function testAddOneDataProvider(int $a, int $b, int $expected): void
    {
        $this->assertSame($expected, $a + $b);
    }

    /**
     * @dataProvider additionProvider
     * @dataProvider additionProvider2
     */
    public function testAddTwoDataProviders(int $a, int $b, int $expected): void
    {
        $this->assertSame($expected, $a + $b);
    }

    public static function additionProvider(): array
    {
        return [
            [0, 0, 0],
            [0, 1, 1],
            [1, 0, 1],
            [1, 1, 2],
        ];
    }

    public static function additionProvider2(): array
    {
        return [
            [1, 0, 1],
            [2, 1, 3],
            [3, 0, 3],
            [4, 1, 5],
        ];
    }

    public function testEmpty(): array
    {
        $stack = [];
        $this->assertEmpty($stack);

        return $stack;
    }

    /**
     * @depends testEmpty
     */
    public function testPush(array $stack): array
    {
        array_push($stack, 'foo');
        $this->assertSame('foo', $stack[count($stack) - 1]);
        $this->assertNotEmpty($stack);

        return $stack;
    }

    /**
     * @group chiefmyron
     *
     * @return void
     */
    public function testGroupAnnotation(): void {
        $this->assertTrue(true);
    }

    /**
     * @small
     *
     * @return void
     */
    public function testSmallAnnotation(): void {
        $this->assertTrue(true);
    }

    /**
     * @medium
     *
     * @return void
     */
    public function testMediumAnnotation(): void {
        $this->assertTrue(true);
    }

    /**
     * @large
     *
     * @return void
     */
    public function testLargeAnnotation(): void {
        $this->assertTrue(true);
    }

    /**
     * @ticket chiefmyron
     *
     * @return void
     */
    public function testTicketAnnotation(): void {
        $this->assertTrue(true);
    }
}
