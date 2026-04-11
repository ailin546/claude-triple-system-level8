#!/usr/bin/env node
/**
 * Rules Loader — 按语言按需加载 rules
 *
 * 检测项目使用的语言，将 rules-all/<lang>/ 软链到 rules/<lang>/
 * common/ 始终加载。
 *
 * 由 SessionStart hook 调用。
 */

const path = require('path');
const fs = require('fs');

const { getProjectRoot } = require('../lib/project-root');
const PROJECT_ROOT = getProjectRoot();
const RULES_ALL = path.join(PROJECT_ROOT, '.claude', 'rules-all');
const RULES_ACTIVE = path.join(PROJECT_ROOT, '.claude', 'rules');

// 语言检测: 文件 → 对应的 rules 目录名
const LANG_DETECTORS = [
  { files: ['package.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs', 'vite.config.ts', 'angular.json'], rulesDir: 'typescript' },
  { files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'], rulesDir: 'python' },
  { files: ['go.mod', 'go.sum'], rulesDir: 'golang' },
  { files: ['Cargo.toml'], rulesDir: 'rust' },
  { files: ['build.gradle', 'build.gradle.kts', 'pom.xml'], rulesDir: 'kotlin' },
  { files: ['Package.swift', '*.xcodeproj'], rulesDir: 'swift' },
  { files: ['composer.json'], rulesDir: 'php' },
  { files: ['cpanfile', 'Makefile.PL', 'dist.ini'], rulesDir: 'perl' },
];

function log(msg) {
  console.error(`[RulesLoader] ${msg}`);
}

function detectLanguages() {
  const detected = [];
  for (const detector of LANG_DETECTORS) {
    for (const file of detector.files) {
      if (file.includes('*')) {
        // glob 模式: 检查目录中是否有匹配文件
        try {
          const ext = file.replace('*', '');
          const entries = fs.readdirSync(PROJECT_ROOT);
          if (entries.some(e => e.endsWith(ext))) {
            if (!detected.includes(detector.rulesDir)) detected.push(detector.rulesDir);
          }
        } catch { /* ignore */ }
      } else if (fs.existsSync(path.join(PROJECT_ROOT, file))) {
        if (!detected.includes(detector.rulesDir)) detected.push(detector.rulesDir);
        break;
      }
    }
  }
  return detected;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function loadRules() {
  // 如果 rules-all 不存在，说明还没做过迁移，跳过
  if (!fs.existsSync(RULES_ALL)) {
    log('rules-all/ not found, skipping dynamic loading');
    return;
  }

  ensureDir(RULES_ACTIVE);

  // 1. 清理旧的语言 symlinks（保留 common 和非 symlink 目录）
  if (fs.existsSync(RULES_ACTIVE)) {
    const entries = fs.readdirSync(RULES_ACTIVE);
    for (const entry of entries) {
      const fullPath = path.join(RULES_ACTIVE, entry);
      if (entry === 'common') continue; // common 始终保留
      if (isSymlink(fullPath)) {
        fs.unlinkSync(fullPath);
        log(`Removed stale symlink: rules/${entry}`);
      }
    }
  }

  // 2. 确保 common 存在（实体目录或 symlink）
  const commonActive = path.join(RULES_ACTIVE, 'common');
  const commonSource = path.join(RULES_ALL, 'common');
  if (!fs.existsSync(commonActive) && fs.existsSync(commonSource)) {
    fs.symlinkSync(commonSource, commonActive, 'dir');
    log('Linked: rules/common');
  }

  // 3. 检测语言并链接对应 rules
  const languages = detectLanguages();

  if (languages.length === 0) {
    log('No specific language detected, only common rules active');
  } else {
    for (const lang of languages) {
      const source = path.join(RULES_ALL, lang);
      const target = path.join(RULES_ACTIVE, lang);
      if (fs.existsSync(source) && !fs.existsSync(target)) {
        fs.symlinkSync(source, target, 'dir');
        log(`Linked: rules/${lang}`);
      }
    }
    log(`Active languages: ${languages.join(', ')}`);
  }

  // 输出到 stdout（注入 Claude 上下文）
  const activeRules = fs.readdirSync(RULES_ACTIVE).filter(d => {
    const p = path.join(RULES_ACTIVE, d);
    return fs.statSync(p).isDirectory() || isSymlink(p);
  });
  process.stdout.write(`Active rules: ${activeRules.join(', ')}\n`);
}

try {
  loadRules();
} catch (err) {
  log(`Error: ${err.message}`);
}
