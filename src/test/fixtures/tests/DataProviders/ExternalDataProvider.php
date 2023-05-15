<?php

namespace Chiefmyron\TestWorkbench\DataProviders;

final class ExternalDataProvider {
    public static function additionProvider(): array
    {
        return [
            [0, 0, 0],
            [0, 1, 1],
            [1, 0, 1],
            [1, 1, 2],
        ];
    }
}