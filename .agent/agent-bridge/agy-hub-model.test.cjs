'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildSendBody, resolvePlanModelFromConfig } = require('./agy-hub');

test('request bodies do not infer a hub model implicitly', () => {
    assert.deepEqual(buildSendBody('cascade-1', 'hello'), {
        cascadeId: 'cascade-1',
        items: [{ text: 'hello' }]
    });
});

test('an explicitly supplied model remains an opt-in override', () => {
    assert.deepEqual(buildSendBody('cascade-1', 'hello', 'MODEL_PLACEHOLDER_M319'), {
        cascadeId: 'cascade-1',
        items: [{ text: 'hello' }],
        cascadeConfig: { plannerConfig: { planModel: 'MODEL_PLACEHOLDER_M319' } }
    });
});

test('an explicit Gemini model ID resolves to the hub model token, not the external slug', () => {
    const modelConfig = {
        clientModelConfigs: [{
            label: 'Gemini 3.8 Flash (Medium)',
            modelId: 'gemini-3.8-flash-medium',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M319' }
        }]
    };

    assert.equal(resolvePlanModelFromConfig(modelConfig, 'gemini-3.8-flash-medium'), 'MODEL_PLACEHOLDER_M319');
    assert.equal(resolvePlanModelFromConfig(modelConfig, 'Gemini 3.8 Flash (Medium)'), 'MODEL_PLACEHOLDER_M319');
});

test('AGY model resolution refuses unavailable, disabled, or ambiguous models', () => {
    assert.throws(
        () => resolvePlanModelFromConfig({ clientModelConfigs: [] }, 'gemini-3.8-flash-medium'),
        /not available/
    );
    assert.throws(
        () => resolvePlanModelFromConfig({
            clientModelConfigs: [{ label: 'Gemini 3.8 Flash (Medium)', disabled: true, modelOrAlias: { model: 'M319' } }]
        }, 'Gemini 3.8 Flash (Medium)'),
        /not available/
    );
    assert.throws(
        () => resolvePlanModelFromConfig({
            clientModelConfigs: [
                { label: 'Gemini 3.8 Flash (Medium)', modelOrAlias: { model: 'M319' } },
                { label: 'Gemini 3.8 Flash (Medium)', modelOrAlias: { model: 'M320' } }
            ]
        }, 'Gemini 3.8 Flash (Medium)'),
        /ambiguous/
    );
});

test('an explicit model alias remains supported', () => {
    const alias = { alias: 'user-selected-model' };
    assert.deepEqual(buildSendBody('cascade-1', 'hello', alias), {
        cascadeId: 'cascade-1',
        items: [{ text: 'hello' }],
        cascadeConfig: { plannerConfig: { requestedModel: alias } }
    });
});
