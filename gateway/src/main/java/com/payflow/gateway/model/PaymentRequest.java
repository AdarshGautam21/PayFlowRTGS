package com.payflow.gateway.model;

import lombok.Data;
import java.math.BigDecimal;
import java.time.Instant;

@Data
public class PaymentRequest {
    private String messageId;
    private String debitAccount;
    private String creditAccount;
    private BigDecimal amount;
    private String currency;
    private String reference;
    private Instant createdAt = Instant.now();
}
