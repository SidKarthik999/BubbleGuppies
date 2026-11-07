type Props = {
  visible: boolean;
  onClick: () => void;
};

export function BackToLiveBanner({ visible, onClick }: Props) {
  if (!visible) return null;
  return (
    <div className="banner info">
      <span style={{ flex: 1 }}>You're viewing an earlier card.</span>
      <button className="primary" onClick={onClick}>
        Back to live
      </button>
    </div>
  );
}
