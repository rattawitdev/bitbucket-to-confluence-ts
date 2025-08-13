package com.example.api.controller;

import com.example.api.dto.CreateUserRequest;
import com.example.api.dto.UpdateUserRequest;
import com.example.api.dto.UserDTO;
import com.example.api.dto.UserListResponse;
import com.example.api.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import javax.validation.constraints.Min;

/**
 * REST Controller for user management operations.
 * Provides endpoints for CRUD operations on users with validation and error handling.
 * 
 * @author API Team
 * @version 1.0
 * @since 2024-01-01
 */
@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User Management", description = "Operations for managing users")
@Validated
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * Retrieve a user by their unique identifier.
     * Returns complete user information including profile data and preferences.
     * 
     * @param id The unique user identifier (must be positive)
     * @return UserDTO containing user details
     * @throws UserNotFoundException if user with given ID doesn't exist
     */
    @Operation(
        summary = "Get user by ID",
        description = "Retrieve detailed user information including profile and preferences"
    )
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "User found successfully",
            content = @Content(schema = @Schema(implementation = UserDTO.class))
        ),
        @ApiResponse(
            responseCode = "400", 
            description = "Invalid user ID provided"
        ),
        @ApiResponse(
            responseCode = "404",
            description = "User not found"
        )
    })
    @GetMapping("/{id}")
    public ResponseEntity<UserDTO> getUser(
            @Parameter(description = "User ID", example = "123")
            @PathVariable @Min(1) Long id) {
        
        UserDTO user = userService.findById(id);
        return ResponseEntity.ok(user);
    }

    /**
     * Create a new user account with validation.
     * Validates email uniqueness and password strength requirements.
     * Creates user with default active status and sends welcome email.
     * 
     * @param createUserRequest User creation data with validation
     * @return Created user information
     * @throws ValidationException if request data is invalid
     * @throws UserAlreadyExistsException if email is already taken
     */
    @Operation(
        summary = "Create new user",
        description = "Create a new user account with validation and welcome email"
    )
    @ApiResponses({
        @ApiResponse(
            responseCode = "201",
            description = "User created successfully",
            content = @Content(schema = @Schema(implementation = UserDTO.class))
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid request data or validation errors"
        ),
        @ApiResponse(
            responseCode = "409",
            description = "User with this email already exists"
        )
    })
    @PostMapping
    public ResponseEntity<UserDTO> createUser(
            @Valid @RequestBody CreateUserRequest createUserRequest) {
        
        UserDTO createdUser = userService.createUser(createUserRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdUser);
    }

    /**
     * Update an existing user's information.
     * Supports partial updates - only provided fields will be updated.
     * Email uniqueness is validated if email is being changed.
     * 
     * @param id User identifier to update
     * @param updateUserRequest Updated user data (partial)
     * @return Updated user information
     * @throws UserNotFoundException if user doesn't exist
     * @throws ValidationException if update data is invalid
     */
    @Operation(
        summary = "Update user information",
        description = "Update user with partial data, validates email uniqueness"
    )
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "User updated successfully",
            content = @Content(schema = @Schema(implementation = UserDTO.class))
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid request data"
        ),
        @ApiResponse(
            responseCode = "404",
            description = "User not found"
        ),
        @ApiResponse(
            responseCode = "409",
            description = "Email already taken by another user"
        )
    })
    @PutMapping("/{id}")
    public ResponseEntity<UserDTO> updateUser(
            @Parameter(description = "User ID to update", example = "123")
            @PathVariable @Min(1) Long id,
            @Valid @RequestBody UpdateUserRequest updateUserRequest) {
        
        UserDTO updatedUser = userService.updateUser(id, updateUserRequest);
        return ResponseEntity.ok(updatedUser);
    }

    /**
     * Soft delete a user account.
     * Marks the user as inactive but preserves data for audit purposes.
     * User can be reactivated by admin if needed.
     * 
     * @param id User identifier to delete
     * @return No content on successful deletion
     * @throws UserNotFoundException if user doesn't exist
     */
    @Operation(
        summary = "Delete user account",
        description = "Soft delete user account (marks as inactive)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "User deleted successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid user ID"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(
            @Parameter(description = "User ID to delete", example = "123")
            @PathVariable @Min(1) Long id) {
        
        userService.softDeleteUser(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Get paginated list of users with filtering options.
     * Supports search by name/email, active status filtering, and sorting.
     * Results are paginated for better performance with large datasets.
     * 
     * @param search Optional search term for name/email filtering
     * @param active Optional filter by active status
     * @param pageable Pagination and sorting parameters
     * @return Paginated list of users
     */
    @Operation(
        summary = "List users with pagination",
        description = "Get paginated list of users with search and filtering options"
    )
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "Users retrieved successfully",
            content = @Content(schema = @Schema(implementation = UserListResponse.class))
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid pagination or filter parameters"
        )
    })
    @GetMapping
    public ResponseEntity<UserListResponse> listUsers(
            @Parameter(description = "Search term for name/email", example = "john")
            @RequestParam(required = false) String search,
            
            @Parameter(description = "Filter by active status", example = "true")
            @RequestParam(required = false) Boolean active,
            
            @Parameter(description = "Pagination parameters")
            @PageableDefault(size = 10, sort = "id") Pageable pageable) {
        
        UserListResponse users = userService.listUsers(search, active, pageable);
        return ResponseEntity.ok(users);
    }

    /**
     * Get user profile information.
     * Returns detailed profile data including bio, avatar, and preferences.
     * 
     * @param id User identifier
     * @return User profile information
     * @throws UserNotFoundException if user doesn't exist
     */
    @Operation(
        summary = "Get user profile",
        description = "Retrieve detailed user profile information"
    )
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "Profile retrieved successfully"
        ),
        @ApiResponse(
            responseCode = "404",
            description = "User not found"
        )
    })
    @GetMapping("/{id}/profile")
    public ResponseEntity<UserProfileDTO> getUserProfile(
            @Parameter(description = "User ID", example = "123")
            @PathVariable @Min(1) Long id) {
        
        UserProfileDTO profile = userService.getUserProfile(id);
        return ResponseEntity.ok(profile);
    }

    /**
     * Update user profile information.
     * Updates bio, avatar, and user preferences.
     * 
     * @param id User identifier
     * @param profileRequest Profile update data
     * @return Updated profile information
     * @throws UserNotFoundException if user doesn't exist
     */
    @Operation(
        summary = "Update user profile",
        description = "Update user profile information and preferences"
    )
    @PutMapping("/{id}/profile")
    public ResponseEntity<UserProfileDTO> updateUserProfile(
            @Parameter(description = "User ID", example = "123")
            @PathVariable @Min(1) Long id,
            @Valid @RequestBody UpdateUserProfileRequest profileRequest) {
        
        UserProfileDTO updatedProfile = userService.updateUserProfile(id, profileRequest);
        return ResponseEntity.ok(updatedProfile);
    }
}
