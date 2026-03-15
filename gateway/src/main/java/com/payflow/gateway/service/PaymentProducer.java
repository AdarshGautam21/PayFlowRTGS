package com.payflow.gateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.payflow.gateway.model.PaymentRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class PaymentProducer {

    private static final Logger log = LoggerFactory.getLogger(PaymentProducer.class);
    private static final String TOPIC = "payment.instructions";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public PaymentProducer(KafkaTemplate<String, String> kafkaTemplate, ObjectMapper objectMapper) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    public void publish(PaymentRequest payment) {
        try {
            String payload = objectMapper.writeValueAsString(payment);
            kafkaTemplate.send(TOPIC, payment.getMessageId(), payload)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("[KAFKA] Failed to publish payment={} error={}", 
                            payment.getMessageId(), ex.getMessage());
                    } else {
                        log.info("[KAFKA] Published payment={} topic={} partition={}", 
                            payment.getMessageId(), TOPIC,
                            result.getRecordMetadata().partition());
                    }
                });
        } catch (Exception e) {
            log.error("[KAFKA] Serialization error for payment={}", payment.getMessageId(), e);
        }
    }
}
