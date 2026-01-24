import { Text, Section, Row, Column } from '@react-email/components';

interface AlertRowProps {
  severity: string;
  message: string;
  unitName: string;
  siteName: string;
  triggeredAt: Date;
}

export function AlertRow({
  severity,
  message,
  unitName,
  siteName,
  triggeredAt,
}: AlertRowProps) {
  // Severity colors
  const severityColors: Record<string, string> = {
    critical: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8',
  };

  const severityColor = severityColors[severity] || '#6c757d';

  // Format time
  const timeStr = triggeredAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Section
      style={{
        padding: '12px',
        borderBottom: '1px solid #e9ecef',
        backgroundColor: '#ffffff',
      }}
    >
      <Row>
        <Column style={{ width: '100%' }}>
          <Text
            style={{
              margin: '0 0 4px 0',
              fontSize: '14px',
              lineHeight: '1.4',
              color: '#212529',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '3px',
                backgroundColor: severityColor,
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '11px',
                textTransform: 'uppercase',
                marginRight: '8px',
              }}
            >
              {severity}
            </span>
            {unitName} - {siteName}
          </Text>
          <Text
            style={{
              margin: '0',
              fontSize: '13px',
              color: '#6c757d',
              lineHeight: '1.4',
            }}
          >
            {message || 'Alert triggered'}
          </Text>
          <Text
            style={{
              margin: '4px 0 0 0',
              fontSize: '12px',
              color: '#adb5bd',
            }}
          >
            {timeStr}
          </Text>
        </Column>
      </Row>
    </Section>
  );
}
