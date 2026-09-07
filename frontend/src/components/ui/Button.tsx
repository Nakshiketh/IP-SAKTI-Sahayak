import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { buttonStyles, type ButtonVariant } from './buttonStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: 'sm' | 'md' | undefined;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...rest}
    />
  );
});
