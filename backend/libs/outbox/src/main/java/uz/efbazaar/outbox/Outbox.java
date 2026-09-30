package uz.efbazaar.outbox;

/**
 * Kafka'ga ishonchli yozish. Ikkala metod ham FAOL TRANZAKSIYA ichida chaqirilishi shart —
 * event biznes o'zgarishi bilan birga commit bo'ladi yoki birga bekor bo'ladi.
 * Tranzaksiyasiz chaqiruv {@link org.springframework.transaction.IllegalTransactionStateException} beradi.
 */
public interface Outbox {

    /** Payload servisning sozlangan value serializer'i bilan kodlanadi; kalit null bo'lishi mumkin. */
    void publish(String topic, String key, Object payload);

    /** "Shu entity o'zgardi" — relay {@link SnapshotSource} orqali hozirgi holatni yuboradi. */
    void markSnapshot(String source, String entityId);
}
