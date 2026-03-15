package com.payflow.gateway.controller;

import com.payflow.gateway.model.PaymentRequest;
import com.payflow.gateway.model.PaymentResponse;
import com.payflow.gateway.service.PaymentProducer;
import com.payflow.gateway.service.RateLimiterService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);
    private static final int RATE_LIMIT = 100;
    private static final int RATE_WINDOW_SECONDS = 60;

    private final PaymentProducer producer;
    private final RateLimiterService rateLimiter;

    public PaymentController(PaymentProducer producer, RateLimiterService rateLimiter) {
        this.producer = producer;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    public ResponseEntity<PaymentResponse> submitPayment(
            @RequestBody PaymentRequest request,
            @RequestHeader(value = "X-Client-ID", defaultValue = "anonymous") String clientId) {

        // Rate limiting per client
        if (!rateLimiter.isAllowed(clientId, RATE_LIMIT, RATE_WINDOW_SECONDS)) {
            log.warn("[RATE_LIMIT] client={} exceeded limit", clientId);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(new PaymentResponse(null, "REJECTED", "Rate limit exceeded"));
        }

        // Assign idempotency key
        if (request.getMessageId() == null || request.getMessageId().isEmpty()) {
            request.setMessageId(UUID.randomUUID().toString());
        }

        // Validate request
        if (request.getDebitAccount() == null || request.getCreditAccount() == null) {
            return ResponseEntity.badRequest()
                .body(new PaymentResponse(null, "REJECTED", "Debit and credit accounts required"));
        }
        if (request.getAmount() == null || request.getAmount().signum() <= 0) {
            return ResponseEntity.badRequest()
                .body(new PaymentResponse(null, "REJECTED", "Amount must be positive"));
        }

        // Publish to Kafka
        producer.publish(request);

        log.info("[GATEWAY] Accepted payment={} from={} to={} amount={} {}",
            request.getMessageId(), request.getDebitAccount(),
            request.getCreditAccount(), request.getAmount(), request.getCurrency());

        return ResponseEntity.accepted()
            .body(new PaymentResponse(request.getMessageId(), "ACCEPTED", "Payment queued for settlement"));
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("{\"status\":\"ok\",\"service\":\"payflow-gateway\"}");
    }
}
