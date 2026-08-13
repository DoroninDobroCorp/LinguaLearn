import { useState } from 'react';
import { api } from '../api';

export default function PasswordChangeModal({ open, onClose, showToast }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!oldPassword) {
      showToast?.('Please enter your current password', 'error');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showToast?.('New password must be at least 6 characters long', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast?.('New passwords do not match', 'error');
      return;
    }
    setChanging(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast?.('Password changed successfully', 'success');
      onClose();
    } catch (err) {
      showToast?.(err.message || 'Failed to change password', 'error');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal password-change-modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px', maxWidth: '95vw' }}>
        <h2>
          Change Password / Смена пароля
          <button className="modal-close" onClick={onClose}>×</button>
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          <div className="field-block">
            <span>Current Password / Текущий пароль</span>
            <input
              type="password"
              placeholder="Enter current password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div className="field-block">
            <span>New Password / Новый пароль</span>
            <input
              type="password"
              placeholder="Minimum 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="field-block">
            <span>Confirm New Password / Подтверждение</span>
            <input
              type="password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <div className="action-buttons" style={{ marginTop: '8px' }}>
            <button type="button" className="btn btn-link" onClick={onClose} disabled={changing} style={{ flex: 1, justifyContent: 'center' }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={changing} style={{ flex: 2, justifyContent: 'center' }}>
              {changing ? 'Changing…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
