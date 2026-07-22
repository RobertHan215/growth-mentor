import type { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly logo: Locator;
  readonly textarea: Locator;
  readonly enterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.locator('img[alt="成长大师兄"]');
    this.textarea = page.locator('textarea');
    this.enterButton = page
      .getByRole('button', { name: /start practice|enter/i })
      .or(page.locator('button:has-text("开始对练")'));
  }

  async goto() {
    await this.page.goto('/');
  }

  async fillRequirement(text: string) {
    await this.textarea.fill(text);
  }

  async submit() {
    await this.enterButton.click();
  }
}
