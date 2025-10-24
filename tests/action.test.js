const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('GitHub Action Configuration', () => {
  let actionConfig;
  
  beforeAll(() => {
    const actionPath = path.join(__dirname, '../action.yml');
    const actionYaml = fs.readFileSync(actionPath, 'utf8');
    actionConfig = yaml.load(actionYaml);
  });

  describe('Action metadata', () => {
    it('should have required metadata fields', () => {
      expect(actionConfig.name).toBeDefined();
      expect(actionConfig.description).toBeDefined();
      expect(actionConfig.runs).toBeDefined();
    });

    it('should be a composite action', () => {
      expect(actionConfig.runs.using).toBe('composite');
      expect(actionConfig.runs.steps).toBeDefined();
      expect(Array.isArray(actionConfig.runs.steps)).toBe(true);
    });

    it('should have required inputs', () => {
      expect(actionConfig.inputs).toBeDefined();
      expect(actionConfig.inputs['working-directory']).toBeDefined();
      expect(actionConfig.inputs['working-directory'].required).toBe(true);
      
      expect(actionConfig.inputs['node-version']).toBeDefined();
      expect(actionConfig.inputs['node-version'].default).toBe('22');
    });
  });

  describe('Action steps', () => {
    it('should have all required steps', () => {
      const stepNames = actionConfig.runs.steps.map(step => step.name);
      
      expect(stepNames).toContain('Setup Node.js');
      expect(stepNames).toContain('Setup Python');
      expect(stepNames).toContain('Generate licenses CSV');
      expect(stepNames).toContain('Download license files');
      expect(stepNames).toContain('Generate licenses HTML');
    });

    it('should use correct action versions', () => {
      const nodeSetupStep = actionConfig.runs.steps.find(step => 
        step.name === 'Setup Node.js'
      );
      expect(nodeSetupStep.uses).toBe('actions/setup-node@v4');
      
      const pythonSetupStep = actionConfig.runs.steps.find(step => 
        step.name === 'Setup Python'
      );
      expect(pythonSetupStep.uses).toBe('actions/setup-python@v5');
    });

    it('should have proper caching configuration', () => {
      const cacheStep = actionConfig.runs.steps.find(step => 
        step.name === 'Restore cached license files'
      );
      
      expect(cacheStep).toBeDefined();
      expect(cacheStep.uses).toBe('actions/cache@v4');
      expect(cacheStep.with.key).toContain('licenses-');
    });

    it('should use shell bash for all script steps', () => {
      const scriptSteps = actionConfig.runs.steps.filter(step => 
        step.run && !step.uses
      );
      
      scriptSteps.forEach(step => {
        expect(step.shell).toBe('bash');
      });
    });
  });

  describe('Input validation', () => {
    it('should validate working-directory input', () => {
      const workingDirInput = actionConfig.inputs['working-directory'];
      expect(workingDirInput.description).toContain('package.json');
      expect(workingDirInput.required).toBe(true);
    });

    it('should have sensible defaults', () => {
      const nodeVersionInput = actionConfig.inputs['node-version'];
      expect(nodeVersionInput.required).toBe(false);
      expect(nodeVersionInput.default).toBe('22');
    });
  });
});