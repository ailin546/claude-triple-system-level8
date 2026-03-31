---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code.
mode: Standard / Heavy
when: 需求清楚但步骤多、跨多模块、需拆给 agent
not_when: 单文件小修、单次问答、<30 分钟小任务
next: /verify 或 /tdd
heavy_deps: 无
---

# Plan Command

This command invokes the **planner** agent to create a comprehensive implementation plan before writing any code.

## What This Command Does

1. **Restate Requirements** - Clarify what needs to be built (What & Why)
2. **Identify Risks** - Surface potential issues and blockers
3. **Create Step Plan** - Break down implementation into phases
4. **Define Acceptance Criteria** - Concrete, verifiable conditions for "done"
5. **Wait for Confirmation** - MUST receive user approval before proceeding

## When to Use

Use `/plan` when:
- Starting a new feature
- Making significant architectural changes
- Working on complex refactoring
- Multiple files/components will be affected
- Requirements are unclear or ambiguous

## How It Works

The planner agent will:

1. **Analyze the request** and restate requirements in clear terms
2. **Break down into phases** with specific, actionable steps
3. **Identify dependencies** between components
4. **Assess risks** and potential blockers
5. **Estimate complexity** (High/Medium/Low)
6. **Output Acceptance Criteria** with MUST/SHOULD priority (see below)
7. **Present the plan** and WAIT for your explicit confirmation

## Planner Constraints

**聚焦 What 和 Why，不指定 How。**

Planner 的职责是定义产品需求和验收标准，不是规定技术实现细节。

- ✅ "用户可以通过 Google OAuth 登录" (What)
- ✅ "需要 OAuth 是因为减少密码管理负担" (Why)
- ❌ "使用 passport.js 的 GoogleStrategy，配置 callback URL 为 /auth/callback" (How)

**原因**：Anthropic 的经验表明，当 Planner 包含细粒度技术实现细节时，这些细节会级联错误到 Generator 的工作中。让实施者自行决定技术方案，Planner 只负责定义"做什么"和"怎样算完成"。

## Acceptance Criteria 格式

每个 Plan 必须包含 `## Acceptance Criteria` 段落，供 evaluation-loop skill 验证：

```markdown
## Acceptance Criteria

### MUST (硬性，不通过则 FAIL)
- [ ] AC-1: [具体的、可验证的条件]
- [ ] AC-2: [具体的、可验证的条件]

### SHOULD (软性，不通过仅建议修改)
- [ ] AC-3: [期望达到的条件]
- [ ] AC-4: [期望达到的条件]
```

**好的 AC**：具体、可验证、无歧义
- ✅ "用户点击 Google 登录按钮后跳转到 Google 授权页面"
- ✅ "登录成功后返回应用首页，显示用户头像"
- ✅ "登录失败时显示错误提示，不跳转"

**差的 AC**：模糊、不可验证
- ❌ "登录体验流畅"
- ❌ "代码质量好"
- ❌ "性能可接受"

## Example Usage

```
User: /plan I need to add real-time notifications when markets resolve

Agent (planner):
# Implementation Plan: Real-Time Market Resolution Notifications

## Requirements Restatement
- Send notifications to users when markets they're watching resolve
- Support multiple notification channels (in-app, email, webhook)
- Ensure notifications are delivered reliably
- Include market outcome and user's position result

## Implementation Phases

### Phase 1: Database Schema
- Add notifications table with columns: id, user_id, market_id, type, status, created_at
- Add user_notification_preferences table for channel preferences
- Create indexes on user_id and market_id for performance

### Phase 2: Notification Service
- Create notification service in lib/notifications.ts
- Implement notification queue using BullMQ/Redis
- Add retry logic for failed deliveries
- Create notification templates

### Phase 3: Integration Points
- Hook into market resolution logic (when status changes to "resolved")
- Query all users with positions in market
- Enqueue notifications for each user

### Phase 4: Frontend Components
- Create NotificationBell component in header
- Add NotificationList modal
- Implement real-time updates via Supabase subscriptions
- Add notification preferences page

## Dependencies
- Redis (for queue)
- Email service (SendGrid/Resend)
- Supabase real-time subscriptions

## Risks
- HIGH: Email deliverability (SPF/DKIM required)
- MEDIUM: Performance with 1000+ users per market
- MEDIUM: Notification spam if markets resolve frequently
- LOW: Real-time subscription overhead

## Acceptance Criteria

### MUST
- [ ] AC-1: 用户点击通知铃铛图标，弹出通知列表
- [ ] AC-2: 市场 resolve 后 30s 内，相关用户收到通知
- [ ] AC-3: 通知包含市场名称、结果和用户持仓结果
- [ ] AC-4: 所有新增 API 端点有对应测试

### SHOULD
- [ ] AC-5: 支持邮件通知渠道
- [ ] AC-6: 用户可配置通知偏好
- [ ] AC-7: 通知列表支持"标记已读"

## Estimated Complexity: MEDIUM

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)
```

## Important Notes

**CRITICAL**: The planner agent will **NOT** write any code until you explicitly confirm the plan with "yes" or "proceed" or similar affirmative response.

If you want changes, respond with:
- "modify: [your changes]"
- "different approach: [alternative]"
- "skip phase 2 and do phase 3 first"

## Integration with Other Commands

After planning:
- Use `/tdd` to implement with test-driven development
- Use `/build-fix` if build errors occur
- Use `evaluation-loop` skill to run Generator-Evaluator feedback cycle against Acceptance Criteria
- Use `/code-review` to review completed implementation
- Use `/verify` for final objective checks

## Related Agents

This command invokes the `planner` agent provided by ECC.

For manual installs, the source file lives at:
`agents/planner.md`
