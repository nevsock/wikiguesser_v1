import { render, screen } from '@testing-library/react';
import App from './App';

test('初期画面でゲームスタートボタンが表示される', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /ゲームスタート/ })).toBeInTheDocument();
});
