package uz.efbazaar.trade.trade.exception;

public class ProposalNotFoundException extends RuntimeException {
    public ProposalNotFoundException(String proposalId) {
        super("Proposal not found or expired: " + proposalId);
    }
}
